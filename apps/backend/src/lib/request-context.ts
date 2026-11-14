import { AsyncLocalStorage } from "node:async_hooks";
import type { NextFunction, Request, Response } from "express";

/** Per-request flags. Demo only: `x-demo-loan-open: 1` shows the customer's home loan as if the bank had not decided yet. */
interface RequestFlags {
  demoLoanOpen: boolean;
}
const store = new AsyncLocalStorage<RequestFlags>();

export const demoLoanOpen = () => store.getStore()?.demoLoanOpen === true;

export function requestContext(req: Request, _res: Response, next: NextFunction) {
  store.run({ demoLoanOpen: req.header("x-demo-loan-open") === "1" }, next);
}
