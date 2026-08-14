import { Context, Layer } from "effect";

export class ToolPlatform extends Context.Service<
  ToolPlatform,
  {
    readonly os: "win32" | "linux" | "darwin";
    readonly arch: "x64" | "arm64";
  }
>()("@gimped/patch/ToolPlatform") {
  static readonly layer: Layer.Layer<ToolPlatform> = Layer.sync(ToolPlatform, () => {
    const os =
      process.platform === "linux" || process.platform === "darwin" ? process.platform : "win32";
    const arch = process.arch === "arm64" ? "arm64" : "x64";
    return { os, arch };
  });
}
