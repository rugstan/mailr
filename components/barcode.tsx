"use client";
import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

/** Code 128 barcode for thermal-printable intake labels. */
export function Barcode({ value, height = 48 }: { value: string; height?: number }) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, {
        format: "CODE128",
        height,
        displayValue: true,
        fontSize: 14,
        margin: 4,
      });
    } catch (err) {
      console.error("barcode render failed", err);
    }
  }, [value, height]);

  return <svg ref={ref} role="img" aria-label={`Barcode ${value}`} />;
}
