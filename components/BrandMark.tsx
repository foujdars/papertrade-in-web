import Image from "next/image";

export function BrandMark({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <>
      <Image
        src="/papertrade-mark-light.svg"
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        className={`brand-logo-image brand-logo-light ${className}`.trim()}
        priority
      />
      <Image
        src="/papertrade-mark.svg"
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        className={`brand-logo-image brand-logo-dark ${className}`.trim()}
        loading="eager"
      />
    </>
  );
}
