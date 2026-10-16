import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { getActiveSectors, getUserSectors, isMasterEmail } from "../db";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  sectors: Awaited<ReturnType<typeof getUserSectors>>;
  sectorId: number | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let sectors: Awaited<ReturnType<typeof getUserSectors>> = [];

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  if (user) sectors = isMasterEmail(user.email) || user.role === "master"
    ? await getActiveSectors()
    : await getUserSectors(user.id);
  const requestedHeader = opts.req.header("x-villela-sector-id");
  const requestedSectorId = requestedHeader ? Number(requestedHeader) : null;
  const selected = requestedHeader
    ? sectors.find(sector => sector.id === requestedSectorId)
    : sectors.length === 1 ? sectors[0] : undefined;

  return {
    req: opts.req,
    res: opts.res,
    user,
    sectors,
    sectorId: selected?.id ?? null,
  };
}
