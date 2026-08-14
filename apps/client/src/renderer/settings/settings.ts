import { Effect, Match as M, Schema as S, String } from "effect";
import { Command, Submodel, Update } from "foldkit";
import { HtmlBuilder } from "foldkit/html";
import { m } from "foldkit/message";
import { ts } from "foldkit/schema";
import { evo } from "foldkit/struct";
import { Button, Input } from "@foldkit/ui";
import { ClientApi } from "../client-api.ts";

// MODEL

export const Idle = ts("Idle");
export const Loading = ts("Loading");
export const Saving = ts("Saving");
export const Succeeded = ts("Succeeded");
export const Failed = ts("Failed", { detail: S.String });
export const Status = S.Union([Idle, Loading, Saving, Succeeded, Failed]);
export type Status = typeof Status.Type;

export const Model = S.Struct({
  username: S.String,
  password: S.String,
  hasPassword: S.Boolean,
  status: Status,
});
export type Model = typeof Model.Type;

// MESSAGE

export const UpdatedUsername = m("UpdatedUsername", { value: S.String });
export const UpdatedPassword = m("UpdatedPassword", { value: S.String });
export const ClickedSave = m("ClickedSave");
export const CompletedLoadSettings = m("CompletedLoadSettings", {
  username: S.String,
  hasPassword: S.Boolean,
});
export const FailedLoadSettings = m("FailedLoadSettings", { detail: S.String });
export const CompletedSaveSettings = m("CompletedSaveSettings");
export const FailedSaveSettings = m("FailedSaveSettings", { detail: S.String });

export const Message = S.Union([
  UpdatedUsername,
  UpdatedPassword,
  ClickedSave,
  CompletedLoadSettings,
  FailedLoadSettings,
  CompletedSaveSettings,
  FailedSaveSettings,
]);
export type Message = typeof Message.Type;

export type UpdateReturn = Update.Return<Model, Message, ClientApi>;
const withUpdateReturn = M.withReturnType<UpdateReturn>();

// COMMAND

export const LoadSettings = Command.define("LoadSettings", {
  messages: [CompletedLoadSettings, FailedLoadSettings],
  execute: Effect.gen(function* () {
    const api = yield* ClientApi;
    const status = yield* api.settingsGet;
    return CompletedLoadSettings({
      username: status.username,
      hasPassword: status.hasPassword,
    });
  }).pipe(Effect.catch((error) => Effect.succeed(FailedLoadSettings({ detail: error.detail })))),
});

export const SaveSettings = Command.define("SaveSettings", {
  args: { username: S.String, password: S.String },
  messages: [CompletedSaveSettings, FailedSaveSettings],
  execute: ({ username, password }) =>
    Effect.gen(function* () {
      const api = yield* ClientApi;
      yield* api.settingsSet(username, password);
      return CompletedSaveSettings();
    }).pipe(Effect.catch((error) => Effect.succeed(FailedSaveSettings({ detail: error.detail })))),
});

// INIT

export const init = (): UpdateReturn => [
  {
    username: "",
    password: "",
    hasPassword: false,
    status: Idle(),
  },
  [],
];

export const boot = (): UpdateReturn => {
  const [model] = init();
  return [evo(model, { status: () => Loading() }), [LoadSettings()]];
};

// UPDATE

export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      UpdatedUsername: ({ value }) => [evo(model, { username: () => value }), []],
      UpdatedPassword: ({ value }) => [evo(model, { password: () => value }), []],
      ClickedSave: () => {
        if (String.isEmpty(model.username) || String.isEmpty(model.password)) {
          return [
            evo(model, {
              status: () => Failed({ detail: "Username and password must be non-empty" }),
            }),
            [],
          ];
        }
        return [
          evo(model, { status: () => Saving() }),
          [SaveSettings({ username: model.username, password: model.password })],
        ];
      },
      CompletedLoadSettings: ({ username, hasPassword }) => [
        evo(model, {
          username: () => username,
          hasPassword: () => hasPassword,
          status: () => Idle(),
        }),
        [],
      ],
      FailedLoadSettings: ({ detail }) => [
        evo(model, {
          status: () => Failed({ detail }),
        }),
        [],
      ],
      CompletedSaveSettings: () => [
        evo(model, {
          password: () => "",
          hasPassword: () => true,
          status: () => Succeeded(),
        }),
        [],
      ],
      FailedSaveSettings: ({ detail }) => [
        evo(model, {
          status: () => Failed({ detail }),
        }),
        [],
      ],
    }),
  );

// VIEW

const statusView = (status: Status, h: HtmlBuilder<Message>) =>
  M.value(status).pipe(
    M.tagsExhaustive({
      Idle: () => h.empty,
      Loading: () => h.p([h.Class("status")], ["Loading"]),
      Saving: () => h.p([h.Class("status")], ["Saving"]),
      Succeeded: () => h.p([h.Class("status status-ok")], ["Saved"]),
      Failed: ({ detail }) => h.p([h.Class("status status-error")], [detail]),
    }),
  );

export const view = Submodel.defineView<Model, Message>((model, h) =>
  h.section(
    [h.Class("settings")],
    [
      h.h1([], ["Settings"]),
      statusView(model.status, h),
      h.p([h.Class("hint")], [model.hasPassword ? "A password is stored." : "No password stored."]),
      h.div(
        [h.Class("field")],
        [
          h.label([h.For("settings-username")], ["Username"]),
          Input.view(
            {
              id: "settings-username",
              value: model.username,
              onInput: (value) => UpdatedUsername({ value }),
              toView: (attributes) =>
                h.input([...attributes.input, h.AriaLabel("Username"), h.Class("input")]),
            },
            h,
          ),
        ],
      ),
      h.div(
        [h.Class("field")],
        [
          h.label([h.For("settings-password")], ["Password"]),
          Input.view(
            {
              id: "settings-password",
              type: "password",
              value: model.password,
              onInput: (value) => UpdatedPassword({ value }),
              toView: (attributes) =>
                h.input([...attributes.input, h.AriaLabel("Password"), h.Class("input")]),
            },
            h,
          ),
        ],
      ),
      Button.view(
        {
          onClick: ClickedSave(),
          isDisabled: model.status._tag === "Saving" || model.status._tag === "Loading",
          toView: (attributes) => h.button([...attributes.button, h.Class("button")], ["Save"]),
        },
        h,
      ),
    ],
  ),
);
