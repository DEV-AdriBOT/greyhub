import Image from "next/image";

export function Avatar({
  username,
  image,
  size = "normal",
}: {
  username: string;
  image?: string | null;
  size?: "small" | "normal" | "large";
}) {
  if (image) {
    const pixels = size === "small" ? 27 : size === "large" ? 82 : 38;
    return (
      <Image
        className={`avatar avatar-${size}`}
        src={image}
        alt={`${username}'s profile`}
        width={pixels}
        height={pixels}
        unoptimized
      />
    );
  }

  return (
    <span
      className={`avatar avatar-${size} avatar-fallback`}
      aria-hidden="true"
    >
      {username.slice(0, 2).toUpperCase()}
    </span>
  );
}
