"use client";

export function LogoutButton() {
  const onClick = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/login";
  };
  return (
    <button type="button" onClick={onClick} className="btn-outline" title="Log out">
      Log out
    </button>
  );
}
