import { PatchEvent, PatchRegistry, PatchStep } from "@gimped/patch";
import { Array, Effect, Match as M, Number, Option, Schema as S, String } from "effect";
import { Command, Submodel, Update } from "foldkit";
import { Html, HtmlBuilder } from "foldkit/html";
import { m } from "foldkit/message";
import { ts } from "foldkit/schema";
import { evo } from "foldkit/struct";
import { Button, Checkbox, Input } from "@foldkit/ui";
import { ClientApi, clearErrorDetail } from "../client-api.ts";
import { PatchFetchPayload } from "../../shared/client-rpc.ts";

// MODEL

export const Idle = ts("Idle");
export const Running = ts("Running", {
  runId: S.Number,
  payload: PatchFetchPayload,
});
export const Succeeded = ts("Succeeded", { registry: PatchRegistry });
export const Failed = ts("Failed", { detail: S.String, tag: S.String });
export const Cancelled = ts("Cancelled");
export const Run = S.Union([Idle, Running, Succeeded, Failed, Cancelled]);
export type Run = typeof Run.Type;

export const StepStatus = S.Literals(["Started", "Skipped", "Progress"]);
export type StepStatus = typeof StepStatus.Type;

export const StepRow = S.Struct({
  step: PatchStep,
  status: StepStatus,
  fraction: S.optionalKey(S.Number),
  detail: S.String,
  reason: S.optionalKey(S.String),
});
export type StepRow = typeof StepRow.Type;

export const Model = S.Struct({
  manifestId: S.String,
  full: S.Boolean,
  cacheDir: S.String,
  force: S.Boolean,
  guardCode: S.String,
  isGuardRequired: S.Boolean,
  run: Run,
  steps: S.Array(StepRow),
  runId: S.Number,
});
export type Model = typeof Model.Type;

type FetchFields = {
  full: boolean;
  force: boolean;
  manifestId?: string;
  cacheDir?: string;
};

type ProgressFields = {
  step: PatchStep;
  status: "Progress";
  detail: string;
  fraction?: number;
};

type ClearFields = {
  manifestId?: string;
  cacheDir?: string;
};

// MESSAGE

export const ClickedFetch = m("ClickedFetch");
export const ClickedCancel = m("ClickedCancel");
export const ClickedClear = m("ClickedClear");
export const ClickedForce = m("ClickedForce");
export const UpdatedManifestId = m("UpdatedManifestId", { value: S.String });
export const UpdatedCacheDir = m("UpdatedCacheDir", { value: S.String });
export const ToggledFull = m("ToggledFull", { isChecked: S.Boolean });
export const ToggledForce = m("ToggledForce", { isChecked: S.Boolean });
export const UpdatedGuardCode = m("UpdatedGuardCode", { value: S.String });
export const ClickedSubmitGuard = m("ClickedSubmitGuard");
export const GotPatchEvent = m("GotPatchEvent", { event: PatchEvent });
export const FailedPatchFetch = m("FailedPatchFetch", {
  tag: S.String,
  detail: S.String,
});
export const SucceededClear = m("SucceededClear");
export const FailedClear = m("FailedClear", { tag: S.String, detail: S.String });
export const CompletedSubmitSteamGuard = m("CompletedSubmitSteamGuard");
export const FailedSubmitSteamGuard = m("FailedSubmitSteamGuard", {
  tag: S.String,
  detail: S.String,
});

export const Message = S.Union([
  ClickedFetch,
  ClickedCancel,
  ClickedClear,
  ClickedForce,
  UpdatedManifestId,
  UpdatedCacheDir,
  ToggledFull,
  ToggledForce,
  UpdatedGuardCode,
  ClickedSubmitGuard,
  GotPatchEvent,
  FailedPatchFetch,
  SucceededClear,
  FailedClear,
  CompletedSubmitSteamGuard,
  FailedSubmitSteamGuard,
]);
export type Message = typeof Message.Type;

export type UpdateReturn = Update.Return<Model, Message, ClientApi>;
const withUpdateReturn = M.withReturnType<UpdateReturn>();

const omitEmpty = (value: string): string | undefined =>
  String.isEmpty(value) ? undefined : value;

const freezePayload = (model: Model, force: boolean): typeof PatchFetchPayload.Type => {
  const payload: FetchFields = {
    full: model.full,
    force,
  };
  const manifestId = omitEmpty(model.manifestId);
  if (manifestId !== undefined) {
    payload.manifestId = manifestId;
  }
  const cacheDir = omitEmpty(model.cacheDir);
  if (cacheDir !== undefined) {
    payload.cacheDir = cacheDir;
  }
  return PatchFetchPayload.make(payload);
};

const progressRow = (step: PatchStep, detail: string, fraction: number | undefined): StepRow => {
  const row: ProgressFields = {
    step,
    status: "Progress",
    detail,
  };
  if (fraction !== undefined) {
    row.fraction = fraction;
  }
  return StepRow.make(row);
};

const startFetch = (model: Model, force: boolean): UpdateReturn => {
  if (model.run._tag === "Running") {
    return [model, []];
  }
  const runId = model.runId;
  return [
    evo(model, {
      runId: Number.increment,
      force: () => force,
      isGuardRequired: () => false,
      steps: () => [],
      run: () => Running({ runId, payload: freezePayload(model, force) }),
    }),
    [],
  ];
};

const clearArgs = (model: Model): ClearFields => {
  const args: ClearFields = {};
  const manifestId = omitEmpty(model.manifestId);
  if (manifestId !== undefined) {
    args.manifestId = manifestId;
  }
  const cacheDir = omitEmpty(model.cacheDir);
  if (cacheDir !== undefined) {
    args.cacheDir = cacheDir;
  }
  return args;
};

const upsertStep = (steps: ReadonlyArray<StepRow>, next: StepRow): ReadonlyArray<StepRow> =>
  Option.match(
    Array.findFirstIndex(steps, (row) => row.step === next.step),
    {
      onNone: () => Array.append(steps, next),
      onSome: (index) => Array.modify(steps, index, () => next),
    },
  );

// COMMAND

export const ClearPatch = Command.define("ClearPatch", {
  args: {
    manifestId: S.optionalKey(S.String),
    cacheDir: S.optionalKey(S.String),
  },
  messages: [SucceededClear, FailedClear],
  execute: ({ manifestId, cacheDir }) =>
    Effect.gen(function* () {
      const api = yield* ClientApi;
      yield* api.patchClear({ manifestId, cacheDir });
      return SucceededClear();
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(FailedClear({ tag: error._tag, detail: clearErrorDetail(error) })),
      ),
    ),
});

export const SubmitSteamGuard = Command.define("SubmitSteamGuard", {
  args: { code: S.String },
  messages: [CompletedSubmitSteamGuard, FailedSubmitSteamGuard],
  execute: ({ code }) =>
    Effect.gen(function* () {
      const api = yield* ClientApi;
      yield* api.submitSteamGuard(code);
      return CompletedSubmitSteamGuard();
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(FailedSubmitSteamGuard({ tag: error._tag, detail: error.detail })),
      ),
    ),
});

// INIT

export const init = (): UpdateReturn => [
  {
    manifestId: "",
    full: false,
    cacheDir: "",
    force: false,
    guardCode: "",
    isGuardRequired: false,
    run: Idle(),
    steps: [],
    runId: 0,
  },
  [],
];

// UPDATE

export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      ClickedFetch: () => startFetch(model, model.force),
      ClickedForce: () => startFetch(model, true),
      ClickedCancel: () => {
        if (model.run._tag !== "Running") {
          return [model, []];
        }
        return [evo(model, { run: () => Cancelled(), isGuardRequired: () => false }), []];
      },
      ClickedClear: () => {
        if (model.run._tag === "Running") {
          return [model, []];
        }
        return [model, [ClearPatch(clearArgs(model))]];
      },
      UpdatedManifestId: ({ value }) => [evo(model, { manifestId: () => value }), []],
      UpdatedCacheDir: ({ value }) => [evo(model, { cacheDir: () => value }), []],
      ToggledFull: ({ isChecked }) => [evo(model, { full: () => isChecked }), []],
      ToggledForce: ({ isChecked }) => [evo(model, { force: () => isChecked }), []],
      UpdatedGuardCode: ({ value }) => [evo(model, { guardCode: () => value }), []],
      ClickedSubmitGuard: () => {
        if (!model.isGuardRequired || String.isEmpty(model.guardCode)) {
          return [model, []];
        }
        return [model, [SubmitSteamGuard({ code: model.guardCode })]];
      },
      GotPatchEvent: ({ event }) =>
        M.value(model.run).pipe(
          withUpdateReturn,
          M.tag("Running", () =>
            M.value(event).pipe(
              withUpdateReturn,
              M.tagsExhaustive({
                StepStarted: ({ step }) => [
                  evo(model, {
                    steps: upsertStep(
                      model.steps,
                      StepRow.make({ step, status: "Started", detail: "" }),
                    ),
                  }),
                  [],
                ],
                StepSkipped: ({ step, reason }) => [
                  evo(model, {
                    steps: upsertStep(
                      model.steps,
                      StepRow.make({ step, status: "Skipped", detail: reason, reason }),
                    ),
                  }),
                  [],
                ],
                StepProgress: ({ step, detail, fraction }) => [
                  evo(model, {
                    steps: upsertStep(model.steps, progressRow(step, detail, fraction)),
                  }),
                  [],
                ],
                SteamGuardRequired: () => [evo(model, { isGuardRequired: () => true }), []],
                Completed: ({ registry }) => [
                  evo(model, {
                    run: () => Succeeded({ registry }),
                    isGuardRequired: () => false,
                  }),
                  [],
                ],
              }),
            ),
          ),
          M.orElse(() => [model, []]),
        ),
      FailedPatchFetch: ({ tag, detail }) => {
        if (model.run._tag !== "Running") {
          return [model, []];
        }
        return [
          evo(model, {
            run: () => Failed({ tag, detail }),
            isGuardRequired: () => false,
          }),
          [],
        ];
      },
      SucceededClear: () => [
        evo(model, {
          run: () => Idle(),
          steps: () => [],
        }),
        [],
      ],
      FailedClear: ({ tag, detail }) => [
        evo(model, {
          run: () => Failed({ tag, detail }),
        }),
        [],
      ],
      CompletedSubmitSteamGuard: () => [evo(model, { guardCode: () => "" }), []],
      FailedSubmitSteamGuard: ({ tag, detail }) => [
        evo(model, {
          run: () => Failed({ tag, detail }),
        }),
        [],
      ],
    }),
  );

// VIEW

const isRunning = (model: Model): boolean => model.run._tag === "Running";

const runStatusView = (run: Run, h: HtmlBuilder<Message>): Html =>
  M.value(run).pipe(
    M.tagsExhaustive({
      Idle: () => h.p([h.Class("status")], ["Idle"]),
      Running: () => h.p([h.Class("status")], ["Running"]),
      Succeeded: ({ registry }) =>
        h.p([h.Class("status status-ok")], [`Succeeded ${registry.steamManifestId}`]),
      Failed: ({ tag, detail }) => h.p([h.Class("status status-error")], [`${tag}: ${detail}`]),
      Cancelled: () => h.p([h.Class("status")], ["Cancelled"]),
    }),
  );

const stepProgressView = (row: StepRow, h: HtmlBuilder<Message>): Html => {
  if (row.fraction !== undefined) {
    return h.progress([h.Value(String(row.fraction)), h.Max("1"), h.Class("step-progress")]);
  }
  if (row.status === "Started" || row.status === "Progress") {
    return h.span([h.Class("running")], ["running"]);
  }
  return h.empty;
};

const stepView = (row: StepRow, h: HtmlBuilder<Message>): Html =>
  h.keyed("li")(
    row.step,
    [h.Class("step")],
    [
      h.div(
        [h.Class("step-header")],
        [
          h.span([h.Class("step-name")], [row.step]),
          h.span([h.Class("step-status")], [row.status]),
        ],
      ),
      String.isEmpty(row.detail) ? h.empty : h.p([h.Class("step-detail")], [row.detail]),
      stepProgressView(row, h),
    ],
  );

export const view = Submodel.defineView<Model, Message>((model, h): Html => {
  const running = isRunning(model);
  return h.section(
    [h.Class("patch")],
    [
      h.h1([], ["Patch"]),
      runStatusView(model.run, h),
      h.div(
        [h.Class("field")],
        [
          h.label([h.For("patch-manifest-id")], ["Manifest id"]),
          Input.view(
            {
              id: "patch-manifest-id",
              value: model.manifestId,
              isDisabled: running,
              onInput: (value) => UpdatedManifestId({ value }),
              toView: (attributes) =>
                h.input([...attributes.input, h.AriaLabel("Manifest id"), h.Class("input")]),
            },
            h,
          ),
        ],
      ),
      h.div(
        [h.Class("field")],
        [
          h.label([h.For("patch-cache-dir")], ["Cache dir"]),
          Input.view(
            {
              id: "patch-cache-dir",
              value: model.cacheDir,
              isDisabled: running,
              onInput: (value) => UpdatedCacheDir({ value }),
              toView: (attributes) =>
                h.input([...attributes.input, h.AriaLabel("Cache dir"), h.Class("input")]),
            },
            h,
          ),
        ],
      ),
      h.div(
        [h.Class("checks")],
        [
          Checkbox.view(
            {
              id: "patch-full",
              isChecked: model.full,
              isDisabled: running,
              onToggle: (isChecked) => ToggledFull({ isChecked }),
              toView: (attributes) =>
                h.div(
                  [h.Class("check")],
                  [
                    h.button(
                      [...attributes.checkbox, h.AriaLabel("Full"), h.Class("check-box")],
                      [model.full ? "✓" : ""],
                    ),
                    h.span([...attributes.label], ["Full"]),
                  ],
                ),
            },
            h,
          ),
          Checkbox.view(
            {
              id: "patch-force",
              isChecked: model.force,
              isDisabled: running,
              onToggle: (isChecked) => ToggledForce({ isChecked }),
              toView: (attributes) =>
                h.div(
                  [h.Class("check")],
                  [
                    h.button(
                      [...attributes.checkbox, h.AriaLabel("Force"), h.Class("check-box")],
                      [model.force ? "✓" : ""],
                    ),
                    h.span([...attributes.label], ["Force"]),
                  ],
                ),
            },
            h,
          ),
        ],
      ),
      h.div(
        [h.Class("actions")],
        [
          Button.view(
            {
              onClick: ClickedFetch(),
              isDisabled: running,
              toView: (attributes) =>
                h.button([...attributes.button, h.Class("button")], ["Fetch"]),
            },
            h,
          ),
          Button.view(
            {
              onClick: ClickedForce(),
              isDisabled: running,
              toView: (attributes) =>
                h.button([...attributes.button, h.Class("button")], ["Force"]),
            },
            h,
          ),
          Button.view(
            {
              onClick: ClickedCancel(),
              isDisabled: !running,
              toView: (attributes) =>
                h.button([...attributes.button, h.Class("button")], ["Cancel"]),
            },
            h,
          ),
          Button.view(
            {
              onClick: ClickedClear(),
              isDisabled: running,
              toView: (attributes) =>
                h.button([...attributes.button, h.Class("button")], ["Clear"]),
            },
            h,
          ),
        ],
      ),
      model.isGuardRequired
        ? h.div(
            [h.Class("guard")],
            [
              h.label([h.For("patch-guard-code")], ["Steam Guard"]),
              Input.view(
                {
                  id: "patch-guard-code",
                  value: model.guardCode,
                  onInput: (value) => UpdatedGuardCode({ value }),
                  toView: (attributes) =>
                    h.input([...attributes.input, h.AriaLabel("Steam Guard"), h.Class("input")]),
                },
                h,
              ),
              Button.view(
                {
                  onClick: ClickedSubmitGuard(),
                  toView: (attributes) =>
                    h.button([...attributes.button, h.Class("button")], ["Submit Guard"]),
                },
                h,
              ),
            ],
          )
        : h.empty,
      Array.match(model.steps, {
        onEmpty: () => h.empty,
        onNonEmpty: (steps) =>
          h.ul(
            [h.Class("steps")],
            Array.map(steps, (row) => stepView(row, h)),
          ),
      }),
    ],
  );
});
