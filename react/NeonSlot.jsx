/**
 * Thin React wrapper around the <neon-slot> web component.
 *
 *   import NeonSlot from './NeonSlot.jsx';
 *   import './neon-slot.js'; // or load via <script> / your bundler
 *
 *   <NeonSlot
 *     engine="stylized"
 *     balance={1000}
 *     bet={25}
 *     currency="COINS"
 *     threeSrc="/assets/three.min.js"
 *     config={{ riskOdds: 0.45 }}
 *     resolveSpin={async (bet) => (await fetch('/api/spin',{method:'POST',body:JSON.stringify({bet})})).json()}
 *     onWin={(d) => console.log('win', d)}
 *     onBalancechange={(d) => setBalance(d.balance)}
 *   />
 *
 * Any prop starting with `on` + EventName maps to the matching component event
 * (onWin -> 'win', onSpinstart -> 'spinstart', onBalancechange -> 'balancechange', etc.).
 */
import React, { useEffect, useRef } from "react";

const EVENTS = [
  "spinstart", "spinend", "result", "win", "noresult",
  "phasechange", "risk", "bank", "bust", "balancechange",
  "betchange", "insufficient", "engineerror", "error"
];

export default function NeonSlot({
  engine = "stylized",
  balance,
  bet,
  currency,
  threeSrc,
  muted,
  config,
  resolveSpin,
  resolveRisk,
  style,
  className,
  ...handlers
}) {
  const ref = useRef(null);

  // attributes
  useEffect(() => { if (ref.current) ref.current.setAttribute("engine", engine); }, [engine]);
  useEffect(() => { if (ref.current && balance != null) ref.current.setBalance(balance); }, [balance]);
  useEffect(() => { if (ref.current && bet != null) ref.current.setBet(bet); }, [bet]);
  useEffect(() => { if (ref.current && currency) ref.current.setAttribute("currency", currency); }, [currency]);
  useEffect(() => { if (ref.current && threeSrc) ref.current.setAttribute("three-src", threeSrc); }, [threeSrc]);
  useEffect(() => { if (ref.current) muted ? ref.current.setAttribute("muted", "") : ref.current.removeAttribute("muted"); }, [muted]);

  // rich props
  useEffect(() => { if (ref.current && config) ref.current.config = config; }, [config]);
  useEffect(() => { if (ref.current) ref.current.resolveSpin = resolveSpin || null; }, [resolveSpin]);
  useEffect(() => { if (ref.current) ref.current.resolveRisk = resolveRisk || null; }, [resolveRisk]);

  // events: onWin -> 'win'
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const bound = [];
    EVENTS.forEach((ev) => {
      const propName = "on" + ev.charAt(0).toUpperCase() + ev.slice(1);
      const fn = handlers[propName];
      if (typeof fn === "function") {
        const wrapped = (e) => fn(e.detail, e);
        el.addEventListener(ev, wrapped);
        bound.push([ev, wrapped]);
      }
    });
    return () => bound.forEach(([ev, fn]) => el.removeEventListener(ev, fn));
  });

  return <neon-slot ref={ref} class={className} style={style} />;
}
