"use client";

export function ConfirmAction({
  action,
  label,
  message,
  danger = false,
}: {
  action: () => void | Promise<void>;
  label: string;
  message: string;
  danger?: boolean;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      <button className={`button${danger ? " danger" : ""}`}>{label}</button>
    </form>
  );
}
