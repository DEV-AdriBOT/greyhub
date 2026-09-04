export function Avatar({ username, image, size = "normal" }: { username: string; image?: string | null; size?: "small" | "normal" | "large" }) {
  if (image) {
    return <img className={`avatar avatar-${size}`} src={image} alt={`${username}'s profile`} />;
  }

  return <span className={`avatar avatar-${size} avatar-fallback`} aria-hidden="true">{username.slice(0, 2).toUpperCase()}</span>;
}
