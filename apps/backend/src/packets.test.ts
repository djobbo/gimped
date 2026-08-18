import { describe, expect, it } from "@effect/vitest";
import { dumpNameByType } from "./dump-names.ts";
import { nameForType, PacketType } from "./packets.ts";

describe("packet type table", () => {
  it("matches handshake IDs assigned in class_725.as", () => {
    expect(dumpNameByType[PacketType.keepAlive]).toBe("var_9413");
    expect(dumpNameByType[PacketType.clientVersion]).toBe("var_1802");
    expect(dumpNameByType[PacketType.protocolHello]).toBe("var_3163");
    expect(dumpNameByType[PacketType.loginAccepted]).toBe("var_1783");
    expect(dumpNameByType[PacketType.createCustomRoom]).toBe("var_5874");
    expect(dumpNameByType[PacketType.updateSettings]).toBe("var_4048");
    expect(dumpNameByType[PacketType.addBot]).toBe("var_3770");
    expect(dumpNameByType[PacketType.customLobby]).toBe("var_11345");
    expect(dumpNameByType[PacketType.lobbySettings]).toBe("var_719");
    expect(dumpNameByType[PacketType.lobbyJoin]).toBe("var_13930");
    expect(dumpNameByType[PacketType.startMatch]).toBe("var_6923");
    expect(dumpNameByType[PacketType.assignGameServer]).toBe("var_8382");
    expect(dumpNameByType[PacketType.matchSetup]).toBe("var_5141");
    expect(dumpNameByType[PacketType.gameConnect]).toBe("var_3975");
  });

  it("prefers human aliases for known handshake types", () => {
    expect(nameForType(PacketType.protocolHello)).toBe("protocolHello");
    expect(nameForType(PacketType.createCustomRoom)).toBe("createCustomRoom");
    expect(nameForType(PacketType.customLobby)).toBe("customLobby");
    expect(nameForType(PacketType.startMatch)).toBe("startMatch");
    expect(nameForType(PacketType.assignGameServer)).toBe("assignGameServer");
    expect(nameForType(PacketType.matchSetup)).toBe("matchSetup");
    expect(nameForType(PacketType.gameConnect)).toBe("gameConnect");
    expect(nameForType(PacketType.loginAccepted)).toBe("loginAccepted");
    expect(nameForType(31)).toBe("var_656");
    expect(nameForType(99999)).toBe("type_99999");
  });
});
