import { assetUrl } from "@/lib/chess/asset-url";
import type { PieceSet } from "@/lib/chess/types";

type PieceProps = { type: string; color: "w" | "b"; set?: PieceSet; className?: string };

export function PieceGlyph({ type, color, set = "standard", className }: PieceProps) {
  const ext = set === "standard" ? "svg" : "png";
  const src = assetUrl(`/pieces/${set}/${color}${type}.${ext}`);
  return <img src={src} alt="" draggable={false} className={className} />;
}
