"use client";

import { createContext, useContext } from "react";
import type { BasketSide } from "@/lib/option-basket";
import type { BasketVenue } from "@/lib/option-basket-orders";
import type { Instrument } from "@/lib/market";

export type { BuilderContext } from "@/lib/option-builder-context";
export type BasketOrder = BasketVenue;
export const OptionDeskContext = createContext<{
  owner: string;
  available: { INR: number | null; USD: number | null };
  tradeDelta: (symbol: string, side: BasketSide) => void;
  openIndianOrder: (order: BasketOrder) => void;
  chartMcx: (instrument: Instrument) => void;
  placeBasket: (order: BasketOrder) => Promise<void>;
  reviewBasket: (order: BasketOrder) => Promise<number>;
} | null>(null);
export const useOptionDesk = () => useContext(OptionDeskContext);
