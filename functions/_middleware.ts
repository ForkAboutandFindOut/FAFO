import type { PagesFunction } from "@cloudflare/workers-types";

export const onRequest: PagesFunction = async ({ next }) => next();
