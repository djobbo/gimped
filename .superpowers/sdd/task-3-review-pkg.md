Base: 5de602a809f217be676e8d46627c8cf7fe8af6a1
Head: 97cc1844be75e6f1611f9276ef334a97ce27520e

## Commits
97cc184 feat(swz): add semantic XML JSON codec
## Stat
 packages/swz/package.json         |  3 +-
 packages/swz/src/xmlCodec.test.ts | 35 +++++++++++++++++
 packages/swz/src/xmlCodec.ts      | 59 ++++++++++++++++++++++++++++
 pnpm-lock.yaml                    | 81 ++++++++++++++++++++++++++++++++++-----
 pnpm-workspace.yaml               | 11 +++---
 5 files changed, 173 insertions(+), 16 deletions(-)
## Diff
diff --git a/packages/swz/package.json b/packages/swz/package.json
index 2af8d46..90df6a8 100644
--- a/packages/swz/package.json
+++ b/packages/swz/package.json
@@ -5,19 +5,20 @@
   "type": "module",
   "exports": {
     ".": "./src/index.ts"
   },
   "scripts": {
     "test": "vp test",
     "build": "vp build",
     "check": "vp check"
   },
   "dependencies": {
-    "effect": "catalog:"
+    "effect": "catalog:",
+    "fast-xml-parser": "catalog:"
   },
   "devDependencies": {
     "@effect/platform-node": "catalog:",
     "@types/node": "catalog:",
     "typescript": "catalog:",
     "vite-plus": "catalog:"
   }
 }
diff --git a/packages/swz/src/xmlCodec.test.ts b/packages/swz/src/xmlCodec.test.ts
new file mode 100644
index 0000000..fe9b136
--- /dev/null
+++ b/packages/swz/src/xmlCodec.test.ts
@@ -0,0 +1,35 @@
+import { Effect } from "effect";
+import { describe, expect, it } from "vite-plus/test";
+import { MalformedXml } from "./errors.ts";
+import { jsonToXml, xmlToJson } from "./xmlCodec.ts";
+
+const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);
+const runFail = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(Effect.result(effect));
+
+describe("xmlCodec", () => {
+  it("round-trips semantically (parse -> json -> xml -> parse)", async () => {
+    const native = '<HeroTypes><Hero name="bodvar"><Stat v="1"/></Hero></HeroTypes>';
+    const data = await run(xmlToJson(native, "HeroTypes.xml"));
+    expect(data.root).toEqual({
+      HeroTypes: {
+        Hero: {
+          "@_name": "bodvar",
+          Stat: {
+            "@_v": "1",
+          },
+        },
+      },
+    });
+    const rebuilt = await run(jsonToXml(data, "HeroTypes.xml"));
+    const again = await run(xmlToJson(rebuilt, "HeroTypes.xml"));
+    expect(again.root).toEqual(data.root);
+  });
+
+  it("rejects malformed XML", async () => {
+    const result = await runFail(xmlToJson("<HeroTypes><Hero></HeroTypes>", "bad.xml"));
+    expect(result._tag).toBe("Failure");
+    if (result._tag === "Failure") {
+      expect(result.failure).toBeInstanceOf(MalformedXml);
+    }
+  });
+});
diff --git a/packages/swz/src/xmlCodec.ts b/packages/swz/src/xmlCodec.ts
new file mode 100644
index 0000000..5265725
--- /dev/null
+++ b/packages/swz/src/xmlCodec.ts
@@ -0,0 +1,59 @@
+import { Effect } from "effect";
+import { XMLBuilder, XMLParser, XMLValidator } from "fast-xml-parser";
+import { MalformedXml } from "./errors.ts";
+
+export type XmlJsonData = {
+  readonly root: Readonly<Record<string, unknown>>;
+};
+
+const parserOptions = {
+  ignoreAttributes: false,
+  attributeNamePrefix: "@_",
+  textNodeName: "#text",
+  parseAttributeValue: false,
+  parseTagValue: false,
+} as const;
+
+const parser = new XMLParser(parserOptions);
+const builder = new XMLBuilder(parserOptions);
+
+const malformed = (path: string, message: string): MalformedXml => new MalformedXml({ path, message });
+
+const validateSingleRootObject = (value: unknown, context: string): Readonly<Record<string, unknown>> => {
+  if (typeof value !== "object" || value === null || Array.isArray(value)) {
+    throw new Error(`${context} must be a non-null object`);
+  }
+
+  const keys = Object.keys(value);
+  if (keys.length !== 1) {
+    throw new Error(`${context} must contain exactly one root key`);
+  }
+
+  return value as Readonly<Record<string, unknown>>;
+};
+
+export const xmlToJson = (content: string, path: string): Effect.Effect<XmlJsonData, MalformedXml> =>
+  Effect.try({
+    try: () => {
+      const validation = XMLValidator.validate(content);
+      if (validation !== true) {
+        throw new Error(validation.err.msg);
+      }
+
+      const parsed = parser.parse(content);
+      const root = validateSingleRootObject(parsed, "Parsed XML");
+      return { root };
+    },
+    catch: (error) =>
+      malformed(path, error instanceof Error ? error.message : "Failed to parse XML content"),
+  });
+
+export const jsonToXml = (data: XmlJsonData, path: string): Effect.Effect<string, MalformedXml> =>
+  Effect.try({
+    try: () => {
+      const root = validateSingleRootObject(data.root, "XML root");
+      return builder.build(root);
+    },
+    catch: (error) =>
+      malformed(path, error instanceof Error ? error.message : "Failed to build XML content"),
+  });
diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml
index 52ca274..0274e76 100644
--- a/pnpm-lock.yaml
+++ b/pnpm-lock.yaml
@@ -8,20 +8,23 @@ catalogs:
   default:
     '@effect/platform-node':
       specifier: 4.0.0-beta.107
       version: 4.0.0-beta.107
     '@types/node':
       specifier: ^24.0.0
       version: 24.13.3
     effect:
       specifier: 4.0.0-beta.107
       version: 4.0.0-beta.107
+    fast-xml-parser:
+      specifier: ^5.10.1
+      version: 5.10.1
     typescript:
       specifier: ^5.9.0
       version: 5.9.3
     vite-plus:
       specifier: ^0.2.9
       version: 0.2.9
 
 importers:
 
   .:
@@ -34,20 +37,23 @@ importers:
         version: 5.9.3
       vite-plus:
         specifier: ^0.2.9
         version: 0.2.9(@types/node@24.13.3)(typescript@5.9.3)(vite@8.2.1(@types/node@24.13.3))
 
   packages/swz:
     dependencies:
       effect:
         specifier: 'catalog:'
         version: 4.0.0-beta.107
+      fast-xml-parser:
+        specifier: 'catalog:'
+        version: 5.10.1
     devDependencies:
       '@effect/platform-node':
         specifier: 'catalog:'
         version: 4.0.0-beta.107(effect@4.0.0-beta.107)(ioredis@5.11.1)
       '@types/node':
         specifier: 'catalog:'
         version: 24.13.3
       typescript:
         specifier: 'catalog:'
         version: 5.9.3
@@ -136,20 +142,23 @@ packages:
   '@msgpackr-extract/msgpackr-extract-linux-x64@3.0.4':
     resolution: {integrity: sha512-8TNXMEjJc3QEy7R/x1INhgiU+XakDAFUzBhaz7+Rbrs8NH5UQeHQxxmzsSBJGyV6I1jW79undiQm8tOI+D+8FQ==}
     cpu: [x64]
     os: [linux]
 
   '@msgpackr-extract/msgpackr-extract-win32-x64@3.0.4':
     resolution: {integrity: sha512-CmCXPQrkbwExx3j946/PtHWHbYJiCRBRDl4BlkRQcJB/YOwQxJRTpoo7aTsortjgoJ1x7opzTSxn7C+ASSLVjQ==}
     cpu: [x64]
     os: [win32]
 
+  '@nodable/entities@3.0.0':
+    resolution: {integrity: sha512-8L9xFeTYKhm49xfIypoe2W5wV1m/3Z58kT+7kR9A8OyFxcPduI4VmxaUMQyKYrRjUoLLSXv6EKKID5Tvj9cUVw==}
+
   '@oxc-project/runtime@0.143.0':
     resolution: {integrity: sha512-zIuXUf+YGIgsPk0xlQmzTY8NCSc8jE/pSfDodlQ9H3EGZABmr+AtIjXRrnpQAXuXzhDSNqZz9cuhud8hDDLvpg==}
     engines: {node: ^20.19.0 || >=22.12.0}
 
   '@oxc-project/types@0.143.0':
     resolution: {integrity: sha512-u6JZdLBTLotrNC9Vd6vPssINdzcCzleKAH6EJKImQb7GtYvX5keN2dxkoK44stCc4tffE6QQRtZTXVSzsLUlWA==}
 
   '@oxc-project/types@0.144.0':
     resolution: {integrity: sha512-nuhZIOLuI6TFQ32I/WnUx+SCPY7SdSKwgnFHydAuoS1+Z4BRcaP+RRJmGzl9lw+0OFF7UmaESf7KQRXaNLHypg==}
 
@@ -794,20 +803,23 @@ packages:
     resolution: {integrity: sha512-kSpvPntnXw5+lYjO71ffBEnQ5ycQ74KGIYknh0TS4xeyCuBkOqxyJumxZkMhLBBUCLjDAbx2+Icnr3Zh4ftjpQ==}
 
   ansi-regex@5.0.1:
     resolution: {integrity: sha512-quJQXlTSUGL2LH9SUXo8VwsY4soanhgo6LNSm84E1LBcE8s3O0wpdiRzyR9z/ZZJMlMWv37qOOb9pdJlMUEKFQ==}
     engines: {node: '>=8'}
 
   ansi-styles@5.2.0:
     resolution: {integrity: sha512-Cxwpt2SfTzTtXcfOlzGEee8O+c+MmUgGrNiBcXnuWxuFJHe6a5Hz7qwhwe5OgaSYI0IJvkLqWX1ASG+cJOkEiA==}
     engines: {node: '>=10'}
 
+  anynum@1.0.1:
+    resolution: {integrity: sha512-N6//FLET/tXYNM/F6ABca1oH6fWB+KlTt909Le28WMDBk8oaT4vY17DCrwg2MvmuqUKt3Ni4N5dGJ/EoBgcO6A==}
+
   aria-query@5.3.0:
     resolution: {integrity: sha512-b0P0sZPKtyu8HkeRAfCq0IfURZK+SuwMjY1UXGBU27wpAiTwQAIlq56IbIO+ytk/JjS1fMR14ee5WBBfKi5J6A==}
 
   assertion-error@2.0.1:
     resolution: {integrity: sha512-Izi8RQcffqCeNVgFigKli1ssklIbpHnCYc6AknXGYoB6grJqyeby7jv12JUQgmTAnIDnbck1uxksT4dzN3PWBA==}
     engines: {node: '>=12'}
 
   chai@6.2.2:
     resolution: {integrity: sha512-NUPRluOfOiTKBKvWPtSD4PhFvWCqOi0BGStNWs57X9js7XGTprSmFoz5F0tWhR4WPjNeR9jXqdC7/UpSJTnlRg==}
     engines: {node: '>=18'}
@@ -853,38 +865,48 @@ packages:
     resolution: {integrity: sha512-7RUKfXgSMMkzt6ZuXmqapOurLGPPfgj6l9uRZ7lRGolvk0y2yocc35LdcxKC5PQZdn2DMqioAQ2NoWcrTKmm6g==}
 
   expect-type@1.4.0:
     resolution: {integrity: sha512-KfYbmpRm0VbLjEvVa9yGwCi9GI34xvi7A/HXYWQO65CSD2u3MczUJSuwXKFIxlGsgBQizV9q5J9NHj4VG0n+pA==}
     engines: {node: '>=12.0.0'}
 
   fast-check@4.9.0:
     resolution: {integrity: sha512-7ms6T7SybUev/PQITciI0yLM2pOSFy5zpG8Ty7tQofcVaQUvrMXp6CBwqF6fThLCLOrfBtuHAtwq6Yu4XPCllg==}
     engines: {node: '>=12.17.0'}
 
+  fast-xml-builder@1.3.0:
+    resolution: {integrity: sha512-F74cZEdCvuw9P41GAC3rod4X04jjWGM1JPEv/GWSqFTWLsdyMSBMBMlm9Hk3GLBgLBbdBNY8yee0pQh2RBVESQ==}
+
+  fast-xml-parser@5.10.1:
+    resolution: {integrity: sha512-IEMIf7298kXuZSRFoGfMYrl7is8LpavODgbNz1cwIudv7KwVFnuU+UsMporfq6PD6aXSlawZlARiA3UywCTfMw==}
+    hasBin: true
+
   fdir@6.5.0:
     resolution: {integrity: sha512-tIbYtZbucOs0BRGqPJkshJUYdL+SDH7dVM8gjy+ERp3WAUjLEFJE+02kanyHtwjWOnwrKYBiwAmM0p4kLJAnXg==}
     engines: {node: '>=12.0.0'}
     peerDependencies:
       picomatch: ^3 || ^4
     peerDependenciesMeta:
       picomatch:
         optional: true
 
   fsevents@2.3.3:
     resolution: {integrity: sha512-5xoDfX+fL7faATnagmWPpbFtwh/R77WmMMqqHGS65C3vvB0YHrgF+B1YmZ3441tMj5n63k0212XNoJwzlhffQw==}
     engines: {node: ^8.16.0 || ^10.6.0 || >=11.0.0}
     os: [darwin]
 
   ioredis@5.11.1:
     resolution: {integrity: sha512-ehuGcf94bQXhfagULNXrJdfnWO38v070jxSx/qE87Kjzmu2fU7ro5EFAb+OPituLqgfyuQaym5DlrNydW2sJ9A==}
     engines: {node: '>=12.22.0'}
 
+  is-unsafe@2.0.0:
+    resolution: {integrity: sha512-2LdV822R+wmI86unXA93WCFpL6g+av8ynWk0nrHyJqGop5VoocYsSLFgN8jrfalT6iGeLNM4KXuVSsULP53kEA==}
+
   js-tokens@4.0.0:
     resolution: {integrity: sha512-RdJUflcE3cUzKiMqQgsCu06FPu9UdIJO0beYbPhHN4k6apgJtifcoCtT9bcxOpYBtpD2kCM6Sbzg4CausW/PKQ==}
 
   kubernetes-types@1.30.0:
     resolution: {integrity: sha512-Dew1okvhM/SQcIa2rcgujNndZwU8VnSapDgdxlYoB84ZlpAD43U6KLAFqYo17ykSFGHNPrg0qry0bP+GJd9v7Q==}
 
   lightningcss-android-arm64@1.33.0:
     resolution: {integrity: sha512-gEpRTalKdosp4Bb8qWtc2iOgE5SeIHlpS1up9bFq2wAyYhl1UdTObYiHe98zEM9SQvSoqQZ1IQD0JNpg3Ml5pg==}
     engines: {node: '>= 12.0.0'}
     cpu: [arm64]
@@ -1016,20 +1038,24 @@ packages:
     hasBin: true
     peerDependencies:
       oxlint-tsgolint: '>=7.0.2001'
       vite-plus: '*'
     peerDependenciesMeta:
       oxlint-tsgolint:
         optional: true
       vite-plus:
         optional: true
 
+  path-expression-matcher@1.6.2:
+    resolution: {integrity: sha512-enSlaiat05iasnzmgNxRj8reFdj3puY2QpNgP1aPIaVfT6nn9ICuPoFlKHk8EN22HcwewshO+mN2DGbkCEOtqQ==}
+    engines: {node: '>=14.0.0'}
+
   pathe@2.0.3:
     resolution: {integrity: sha512-WUjGcAqP1gQacoQe+OBJsFA7Ld4DyXuUIjZ5cc75cLHvJ7dtNsTugphxIADwspS+AraAUePCKrSVtPLFj/F88w==}
 
   picocolors@1.1.1:
     resolution: {integrity: sha512-xceH2snhtb5M9liqDsmEw56le376mTZkEX/jEb/RxNFyegNul7eNslCXP9FDj/Lcu0X8KEyMceP2ntpaHrDEVA==}
 
   picomatch@4.0.5:
     resolution: {integrity: sha512-RvwwcruNjI1ncT5xRakeyS9Lf8lcItv34KD+aif+VH9kduAyfYBipGh12274xtenIPZ119/R9BdTBa8gAwSh0A==}
     engines: {node: '>=12'}
 
@@ -1077,20 +1103,23 @@ packages:
 
   stackback@0.0.2:
     resolution: {integrity: sha512-1XMJE5fQo1jGH6Y/7ebnwPOBEkIEnT4QF32d5R1+VXdXveM0IBMJt8zfaxX1P3QhVwrYe+576+jkANtSS2mBbw==}
 
   standard-as-callback@2.1.0:
     resolution: {integrity: sha512-qoRRSyROncaz1z0mvYqIE4lCd9p2R90i6GxW3uZv5ucSu8tU7B5HXUP1gG8pVZsYNVaXjk8ClXHPttLyxAL48A==}
 
   std-env@4.2.0:
     resolution: {integrity: sha512-oCUKSupKTHX53EyjDtuZQ64pjLJ6yYCtpmEw0goYxtjG9KpbRe8KAsl2tBUGU9DyMcJ0RwJ8GqJAFzMXcXW1Rw==}
 
+  strnum@2.4.1:
+    resolution: {integrity: sha512-M9eUSMT2dCB2cTNPG7UYj6KuK7RJR2SN2+yCV/fTW3xzTCS6EaGZ5pSMgDIjB7r8zSfTGk+dvvn9rTjpVS9Mwg==}
+
   tinybench@2.9.0:
     resolution: {integrity: sha512-0+DUvqWMValLmha6lr4kD8iAMK1HzV0/aKnCtWb9v9641TnP/MFb7Pc2bxoxQjTXAErryXVgUOfv2YqNllqGeg==}
 
   tinyexec@1.3.0:
     resolution: {integrity: sha512-QKAl9m8gWWGHV8jZcPeym6j+XULi6tOf1mT83WYJ4Lk2ytW/uwAWkrP0uFsdoYMdueVJ0qs26wZ+23xeB4ibNQ==}
     engines: {node: '>=18'}
 
   tinyglobby@0.2.17:
     resolution: {integrity: sha512-wXR/dYpcqKmfWpEdZjiKJOwCNFndD0DMnrW/cYjVGttEkBfVgcLFHoNrlj47mjOVic9yyNu65alsgF4NQyTa2g==}
     engines: {node: '>=12.0.0'}
@@ -1230,20 +1259,24 @@ packages:
     engines: {node: '>=10.0.0'}
     peerDependencies:
       bufferutil: ^4.0.1
       utf-8-validate: '>=5.0.2'
     peerDependenciesMeta:
       bufferutil:
         optional: true
       utf-8-validate:
         optional: true
 
+  xml-naming@0.3.0:
+    resolution: {integrity: sha512-ghig2TBE/H11aOVgmahA3MhimvkBr6JIYknH/Dhdk10nXwdbIqBJsbfMxpvFPG8bAw77gN29aQWvKpmVoPlvPQ==}
+    engines: {node: '>=16.0.0'}
+
   yuku-codegen@0.5.48:
     resolution: {integrity: sha512-p7HxD5Xl4jzDzqMrGePAOeSHmRY4g58h4HuGq15weQFPxuPWd/W6e7nqp/+Lea6JfpOdBwJOAyXFqIZ/J9Zfnw==}
 
   yuku-parser@0.5.48:
     resolution: {integrity: sha512-OWBfhrpgK9+/4+IXG9oT8Bao4AhViQA7vdyNNH7EUg8dQYgwa70XtIBWTpCEme1P1ECyoDNYkn0wT63f8XRcVA==}
 
 snapshots:
 
   '@babel/code-frame@7.29.7':
     dependencies:
@@ -1292,20 +1325,22 @@ snapshots:
 
   '@msgpackr-extract/msgpackr-extract-linux-arm@3.0.4':
     optional: true
 
   '@msgpackr-extract/msgpackr-extract-linux-x64@3.0.4':
     optional: true
 
   '@msgpackr-extract/msgpackr-extract-win32-x64@3.0.4':
     optional: true
 
+  '@nodable/entities@3.0.0': {}
+
   '@oxc-project/runtime@0.143.0': {}
 
   '@oxc-project/types@0.143.0': {}
 
   '@oxc-project/types@0.144.0': {}
 
   '@oxfmt/binding-android-arm-eabi@0.62.0':
     optional: true
 
   '@oxfmt/binding-android-arm64@0.62.0':
@@ -1514,42 +1549,42 @@ snapshots:
   '@types/estree@1.0.9': {}
 
   '@types/node@24.13.3':
     dependencies:
       undici-types: 7.18.2
 
   '@types/ws@8.18.1':
     dependencies:
       '@types/node': 24.13.3
 
-  '@vitest/browser-preview@4.1.10(vite@8.2.1(@types/node@24.13.3))(vitest@4.1.10(@types/node@24.13.3)(@vitest/browser-preview@4.1.10)(vite@8.2.1(@types/node@24.13.3)))':
+  '@vitest/browser-preview@4.1.10(vite@8.2.1(@types/node@24.13.3))(vitest@4.1.10)':
     dependencies:
       '@testing-library/dom': 10.4.1
       '@testing-library/user-event': 14.6.4(@testing-library/dom@10.4.1)
-      '@vitest/browser': 4.1.10(vite@8.2.1(@types/node@24.13.3))(vitest@4.1.10(@types/node@24.13.3)(@vitest/browser-preview@4.1.10)(vite@8.2.1(@types/node@24.13.3)))
-      vitest: 4.1.10(@types/node@24.13.3)(@vitest/browser-preview@4.1.10(vite@8.2.1(@types/node@24.13.3))(vitest@4.1.10))(vite@8.2.1(@types/node@24.13.3))
+      '@vitest/browser': 4.1.10(vite@8.2.1(@types/node@24.13.3))(vitest@4.1.10)
+      vitest: 4.1.10(@types/node@24.13.3)(@vitest/browser-preview@4.1.10)(vite@8.2.1(@types/node@24.13.3))
     transitivePeerDependencies:
       - bufferutil
       - msw
       - utf-8-validate
       - vite
 
-  '@vitest/browser@4.1.10(vite@8.2.1(@types/node@24.13.3))(vitest@4.1.10(@types/node@24.13.3)(@vitest/browser-preview@4.1.10)(vite@8.2.1(@types/node@24.13.3)))':
+  '@vitest/browser@4.1.10(vite@8.2.1(@types/node@24.13.3))(vitest@4.1.10)':
     dependencies:
       '@blazediff/core': 1.9.1
       '@vitest/mocker': 4.1.10(vite@8.2.1(@types/node@24.13.3))
       '@vitest/utils': 4.1.10
       magic-string: 0.30.21
       pngjs: 7.0.0
       sirv: 3.0.2
       tinyrainbow: 3.1.1
-      vitest: 4.1.10(@types/node@24.13.3)(@vitest/browser-preview@4.1.10(vite@8.2.1(@types/node@24.13.3))(vitest@4.1.10))(vite@8.2.1(@types/node@24.13.3))
+      vitest: 4.1.10(@types/node@24.13.3)(@vitest/browser-preview@4.1.10)(vite@8.2.1(@types/node@24.13.3))
       ws: 8.21.3
     transitivePeerDependencies:
       - bufferutil
       - msw
       - utf-8-validate
       - vite
 
   '@vitest/expect@4.1.10':
     dependencies:
       '@standard-schema/spec': 1.1.0
@@ -1701,20 +1736,22 @@ snapshots:
 
   '@yuku-parser/binding-win32-x64@0.5.48':
     optional: true
 
   '@yuku-toolchain/types@0.5.43': {}
 
   ansi-regex@5.0.1: {}
 
   ansi-styles@5.2.0: {}
 
+  anynum@1.0.1: {}
+
   aria-query@5.3.0:
     dependencies:
       dequal: 2.0.3
 
   assertion-error@2.0.1: {}
 
   chai@6.2.2: {}
 
   cluster-key-slot@1.1.1: {}
 
@@ -1745,39 +1782,55 @@ snapshots:
   estree-walker@3.0.3:
     dependencies:
       '@types/estree': 1.0.9
 
   expect-type@1.4.0: {}
 
   fast-check@4.9.0:
     dependencies:
       pure-rand: 8.4.2
 
+  fast-xml-builder@1.3.0:
+    dependencies:
+      path-expression-matcher: 1.6.2
+      xml-naming: 0.3.0
+
+  fast-xml-parser@5.10.1:
+    dependencies:
+      '@nodable/entities': 3.0.0
+      fast-xml-builder: 1.3.0
+      is-unsafe: 2.0.0
+      path-expression-matcher: 1.6.2
+      strnum: 2.4.1
+      xml-naming: 0.3.0
+
   fdir@6.5.0(picomatch@4.0.5):
     optionalDependencies:
       picomatch: 4.0.5
 
   fsevents@2.3.3:
     optional: true
 
   ioredis@5.11.1:
     dependencies:
       '@ioredis/commands': 1.10.0
       cluster-key-slot: 1.1.1
       debug: 4.4.3
       denque: 2.1.0
       redis-errors: 1.2.0
       redis-parser: 3.0.0
       standard-as-callback: 2.1.0
     transitivePeerDependencies:
       - supports-color
 
+  is-unsafe@2.0.0: {}
+
   js-tokens@4.0.0: {}
 
   kubernetes-types@1.30.0: {}
 
   lightningcss-android-arm64@1.33.0:
     optional: true
 
   lightningcss-darwin-arm64@1.33.0:
     optional: true
 
@@ -1912,20 +1965,22 @@ snapshots:
       '@oxlint/binding-linux-s390x-gnu': 1.77.0
       '@oxlint/binding-linux-x64-gnu': 1.77.0
       '@oxlint/binding-linux-x64-musl': 1.77.0
       '@oxlint/binding-openharmony-arm64': 1.77.0
       '@oxlint/binding-win32-arm64-msvc': 1.77.0
       '@oxlint/binding-win32-ia32-msvc': 1.77.0
       '@oxlint/binding-win32-x64-msvc': 1.77.0
       oxlint-tsgolint: 7.0.2001
       vite-plus: 0.2.9(@types/node@24.13.3)(typescript@5.9.3)(vite@8.2.1(@types/node@24.13.3))
 
+  path-expression-matcher@1.6.2: {}
+
   pathe@2.0.3: {}
 
   picocolors@1.1.1: {}
 
   picomatch@4.0.5: {}
 
   pngjs@7.0.0: {}
 
   postcss@8.5.26:
     dependencies:
@@ -1978,20 +2033,24 @@ snapshots:
       totalist: 3.0.1
 
   source-map-js@1.2.1: {}
 
   stackback@0.0.2: {}
 
   standard-as-callback@2.1.0: {}
 
   std-env@4.2.0: {}
 
+  strnum@2.4.1:
+    dependencies:
+      anynum: 1.0.1
+
   tinybench@2.9.0: {}
 
   tinyexec@1.3.0: {}
 
   tinyglobby@0.2.17:
     dependencies:
       fdir: 6.5.0(picomatch@4.0.5)
       picomatch: 4.0.5
 
   tinypool@2.1.0: {}
@@ -2005,34 +2064,34 @@ snapshots:
   undici-types@7.18.2: {}
 
   undici@8.10.0: {}
 
   uuid@14.0.1: {}
 
   vite-plus@0.2.9(@types/node@24.13.3)(typescript@5.9.3)(vite@8.2.1(@types/node@24.13.3)):
     dependencies:
       '@oxc-project/types': 0.143.0
       '@oxlint/plugins': 1.73.0
-      '@vitest/browser': 4.1.10(vite@8.2.1(@types/node@24.13.3))(vitest@4.1.10(@types/node@24.13.3)(@vitest/browser-preview@4.1.10)(vite@8.2.1(@types/node@24.13.3)))
-      '@vitest/browser-preview': 4.1.10(vite@8.2.1(@types/node@24.13.3))(vitest@4.1.10(@types/node@24.13.3)(@vitest/browser-preview@4.1.10)(vite@8.2.1(@types/node@24.13.3)))
+      '@vitest/browser': 4.1.10(vite@8.2.1(@types/node@24.13.3))(vitest@4.1.10)
+      '@vitest/browser-preview': 4.1.10(vite@8.2.1(@types/node@24.13.3))(vitest@4.1.10)
       '@vitest/expect': 4.1.10
       '@vitest/mocker': 4.1.10(vite@8.2.1(@types/node@24.13.3))
       '@vitest/pretty-format': 4.1.10
       '@vitest/runner': 4.1.10
       '@vitest/snapshot': 4.1.10
       '@vitest/spy': 4.1.10
       '@vitest/utils': 4.1.10
       '@voidzero-dev/vite-plus-core': 0.2.9(@types/node@24.13.3)(typescript@5.9.3)
       oxfmt: 0.62.0(vite-plus@0.2.9(@types/node@24.13.3)(typescript@5.9.3)(vite@8.2.1(@types/node@24.13.3)))
       oxlint: 1.77.0(oxlint-tsgolint@7.0.2001)(vite-plus@0.2.9(@types/node@24.13.3)(typescript@5.9.3)(vite@8.2.1(@types/node@24.13.3)))
       oxlint-tsgolint: 7.0.2001
-      vitest: 4.1.10(@types/node@24.13.3)(@vitest/browser-preview@4.1.10(vite@8.2.1(@types/node@24.13.3))(vitest@4.1.10))(vite@8.2.1(@types/node@24.13.3))
+      vitest: 4.1.10(@types/node@24.13.3)(@vitest/browser-preview@4.1.10)(vite@8.2.1(@types/node@24.13.3))
     optionalDependencies:
       '@voidzero-dev/vite-plus-darwin-arm64': 0.2.9
       '@voidzero-dev/vite-plus-darwin-x64': 0.2.9
       '@voidzero-dev/vite-plus-linux-arm64-gnu': 0.2.9
       '@voidzero-dev/vite-plus-linux-arm64-musl': 0.2.9
       '@voidzero-dev/vite-plus-linux-x64-gnu': 0.2.9
       '@voidzero-dev/vite-plus-linux-x64-musl': 0.2.9
       '@voidzero-dev/vite-plus-win32-arm64-msvc': 0.2.9
       '@voidzero-dev/vite-plus-win32-x64-msvc': 0.2.9
     transitivePeerDependencies:
@@ -2070,21 +2129,21 @@ snapshots:
     dependencies:
       lightningcss: 1.33.0
       picomatch: 4.0.5
       postcss: 8.5.26
       rolldown: 1.2.4
       tinyglobby: 0.2.17
     optionalDependencies:
       '@types/node': 24.13.3
       fsevents: 2.3.3
 
-  vitest@4.1.10(@types/node@24.13.3)(@vitest/browser-preview@4.1.10(vite@8.2.1(@types/node@24.13.3))(vitest@4.1.10))(vite@8.2.1(@types/node@24.13.3)):
+  vitest@4.1.10(@types/node@24.13.3)(@vitest/browser-preview@4.1.10)(vite@8.2.1(@types/node@24.13.3)):
     dependencies:
       '@vitest/expect': 4.1.10
       '@vitest/mocker': 4.1.10(vite@8.2.1(@types/node@24.13.3))
       '@vitest/pretty-format': 4.1.10
       '@vitest/runner': 4.1.10
       '@vitest/snapshot': 4.1.10
       '@vitest/spy': 4.1.10
       '@vitest/utils': 4.1.10
       es-module-lexer: 2.3.1
       expect-type: 1.4.0
@@ -2094,31 +2153,33 @@ snapshots:
       picomatch: 4.0.5
       std-env: 4.2.0
       tinybench: 2.9.0
       tinyexec: 1.3.0
       tinyglobby: 0.2.17
       tinyrainbow: 3.1.1
       vite: 8.2.1(@types/node@24.13.3)
       why-is-node-running: 2.3.0
     optionalDependencies:
       '@types/node': 24.13.3
-      '@vitest/browser-preview': 4.1.10(vite@8.2.1(@types/node@24.13.3))(vitest@4.1.10(@types/node@24.13.3)(@vitest/browser-preview@4.1.10)(vite@8.2.1(@types/node@24.13.3)))
+      '@vitest/browser-preview': 4.1.10(vite@8.2.1(@types/node@24.13.3))(vitest@4.1.10)
     transitivePeerDependencies:
       - msw
 
   why-is-node-running@2.3.0:
     dependencies:
       siginfo: 2.0.0
       stackback: 0.0.2
 
   ws@8.21.3: {}
 
+  xml-naming@0.3.0: {}
+
   yuku-codegen@0.5.48:
     dependencies:
       '@yuku-toolchain/types': 0.5.43
     optionalDependencies:
       '@yuku-codegen/binding-darwin-arm64': 0.5.48
       '@yuku-codegen/binding-darwin-x64': 0.5.48
       '@yuku-codegen/binding-freebsd-x64': 0.5.48
       '@yuku-codegen/binding-linux-arm-gnu': 0.5.48
       '@yuku-codegen/binding-linux-arm-musl': 0.5.48
       '@yuku-codegen/binding-linux-arm64-gnu': 0.5.48
diff --git a/pnpm-workspace.yaml b/pnpm-workspace.yaml
index e3bef1c..9a80032 100644
--- a/pnpm-workspace.yaml
+++ b/pnpm-workspace.yaml
@@ -1,11 +1,12 @@
 packages:
   - packages/*
 
-catalogMode: prefer
-
 catalog:
-  typescript: ^5.9.0
-  "@types/node": ^24.0.0
+  '@effect/platform-node': 4.0.0-beta.107
+  '@types/node': ^24.0.0
   effect: 4.0.0-beta.107
-  "@effect/platform-node": 4.0.0-beta.107
+  fast-xml-parser: ^5.10.1
+  typescript: ^5.9.0
   vite-plus: ^0.2.9
+
+catalogMode: prefer
