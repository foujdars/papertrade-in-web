"use client";

import { createContext, useContext } from "react";
import type { BasketSide } from "@/lib/option-basket";
import type { SpreadMarket } from "@/lib/spread-chain-client";
import type { BasketVenue } from "@/lib/option-basket-orders";
import type { Instrument } from "@/lib/market";

export type BuilderContext = { initialMarket: SpreadMarket; initialRoot: string; initialExpiry: string; initialStrike?: number; initialKind?: "CE" | "PE" };
export type BasketOrder = BasketVenue;
export const OptionDeskContext = createContext<{
  tradeDelta: (symbol: string, side: BasketSide) => void;
  openIndianOrder: (order: BasketOrder) => void;
  chartMcx: (instrument: Instrument) => void;
  placeBasket: (order: BasketOrder) => Promise<void>;
} | null>(null);
export const useOptionDesk = () => useContext(OptionDeskContext);
