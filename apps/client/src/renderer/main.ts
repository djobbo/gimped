import { Array, Effect, Match as M, Option, Schema as S, Stream } from "effect";
import { Command, Runtime, Subscription, Update } from "foldkit";
import { Document, Html, HtmlBuilder } from "foldkit/html";
import { m } from "foldkit/message";
import { evo } from "foldkit/struct";
import { Button } from "@foldkit/ui";
import { ClientApi, patchFetchErrorDetail } from "./client-api.ts";
import * as Patch from "./patch/index.ts";
import * as Settings from "./settings/index.ts";
import { PatchFetchPayload } from "../shared/client-rpc.ts";

export { ClickedCancel, ClickedFetch, GotPatchEvent } from "./patch/index.ts";

// MODEL

export const Screen = S.Literals(["Patch", "Settings"]);
export type Screen = typeof Screen.Type;

export const Model = S.Struct({
  screen: Screen,
  patch: Patch.Model,
  settings: Settings.Model,
});
export type Model = typeof Model.Type;

// MESSAGE

export const ClickedPatch = m("ClickedPatch");
export const ClickedSettings = m("ClickedSettings");
export const ClickedComingSoon = m("ClickedComingSoon");
export const GotPatchMessage = m("GotPatchMessage", { message: Patch.Message });
export const GotSettingsMessage = m("GotSettingsMessage", { message: Settings.Message });

export const Message = S.Union([
  ClickedPatch,
  ClickedSettings,
  ClickedComingSoon,
  GotPatchMessage,
  GotSettingsMessage,
]);
export type Message = typeof Message.Type;

export type UpdateReturn = Update.Return<Model, Message, ClientApi>;
const withUpdateReturn = M.withReturnType<UpdateReturn>();

export const showsGuardField = (model: Model): boolean => model.patch.isGuardRequired;

const foldPatch = Update.foldChild({
  update: Patch.update,
  read: (model: Model) => Option.some(model.patch),
  write: (model: Model, patch: Patch.Model) => evo(model, { patch: () => patch }),
  toParentMessage: (message: Patch.Message) => GotPatchMessage({ message }),
});

const foldSettings = Update.foldChild({
  update: Settings.update,
  read: (model: Model) => Option.some(model.settings),
  write: (model: Model, settings: Settings.Model) => evo(model, { settings: () => settings }),
  toParentMessage: (message: Settings.Message) => GotSettingsMessage({ message }),
});

// INIT

export const init: Runtime.ApplicationInit<Model, Message, void, ClientApi> = () => {
  const [patch] = Patch.init();
  const [settings, settingsCommands] = Settings.boot();
  return [
    { screen: "Patch", patch, settings },
    Command.mapMessages(settingsCommands, (message) => GotSettingsMessage({ message })),
  ];
};

// UPDATE

export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      ClickedPatch: () => [evo(model, { screen: () => "Patch" }), []],
      ClickedSettings: () => [evo(model, { screen: () => "Settings" }), []],
      ClickedComingSoon: () => [model, []],
      GotPatchMessage: ({ message: patchMessage }) => foldPatch(model, patchMessage),
      GotSettingsMessage: ({ message: settingsMessage }) => foldSettings(model, settingsMessage),
    }),
  );

// SUBSCRIPTION

export const subscriptions = Subscription.make<Model, Message, ClientApi>()((entry) => ({
  patchFetch: entry(
    {
      runId: S.optionalKey(S.Number),
      payload: S.optionalKey(PatchFetchPayload),
    },
    {
      modelToDependencies: (model) =>
        model.patch.run._tag === "Running"
          ? { runId: model.patch.run.runId, payload: model.patch.run.payload }
          : {},
      dependenciesToStream: (deps) => {
        if (deps.runId === undefined || deps.payload === undefined) {
          return Stream.empty;
        }
        const payload = deps.payload;
        return Stream.unwrap(
          Effect.gen(function* () {
            const api = yield* ClientApi;
            return api.patchFetch(payload).pipe(
              Stream.map((event) => GotPatchMessage({ message: Patch.GotPatchEvent({ event }) })),
              Stream.catch((error) =>
                Stream.succeed(
                  GotPatchMessage({
                    message: Patch.FailedPatchFetch({
                      tag: error._tag,
                      detail: patchFetchErrorDetail(error),
                    }),
                  }),
                ),
              ),
            );
          }),
        );
      },
    },
  ),
}));

// VIEW

const COMING_SOON: ReadonlyArray<string> = ["SWZ", "Replay", "ANM"];

const navButton = (
  label: string,
  isSelected: boolean,
  onClick: Message,
  h: HtmlBuilder<Message>,
): Html =>
  Button.view(
    {
      onClick,
      toView: (attributes) =>
        h.button(
          [
            ...attributes.button,
            h.Class(isSelected ? "nav-item nav-item-selected" : "nav-item"),
            ...(isSelected ? [h.AriaCurrent("page")] : []),
          ],
          [label],
        ),
    },
    h,
  );

const comingSoonButton = (label: string, h: HtmlBuilder<Message>): Html =>
  Button.view(
    {
      onClick: ClickedComingSoon(),
      toView: (attributes) =>
        h.button([...attributes.button, h.Class("nav-item nav-item-soon")], [label]),
    },
    h,
  );

const sidebarView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.nav(
    [h.Class("sidebar"), h.AriaLabel("Tools")],
    [
      navButton("Patch", model.screen === "Patch", ClickedPatch(), h),
      navButton("Settings", model.screen === "Settings", ClickedSettings(), h),
      ...Array.map(COMING_SOON, (label) => comingSoonButton(label, h)),
    ],
  );

const screenView = (model: Model, h: HtmlBuilder<Message>): Html =>
  M.value(model.screen).pipe(
    M.when("Patch", () =>
      h.submodel({
        slotId: "patch",
        model: model.patch,
        view: Patch.view,
        toParentMessage: (message) => GotPatchMessage({ message }),
      }),
    ),
    M.when("Settings", () =>
      h.submodel({
        slotId: "settings",
        model: model.settings,
        view: Settings.view,
        toParentMessage: (message) => GotSettingsMessage({ message }),
      }),
    ),
    M.exhaustive,
  );

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: "gimped",
  body: h.div(
    [h.Class("shell")],
    [sidebarView(model, h), h.main([h.Class("content")], [screenView(model, h)])],
  ),
});
