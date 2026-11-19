import { ButtonHTMLAttributes, MouseEvent, ReactNode, useState } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void | Promise<void>;
  loadingText?: string;
  children?: ReactNode;
};

/**
 * 请求按钮：点击后自动进入 loading（禁用，防连点），文案换成 loadingText + 小转圈。
 * 只有 onClick 返回 Promise 时才进入 loading（同步按钮不受影响）。
 */
export default function AsyncButton({
  onClick, loadingText = "处理中…", disabled, children, className, ...rest
}: Props) {
  const [busy, setBusy] = useState(false);

  const handle = async (e: MouseEvent<HTMLButtonElement>) => {
    if (busy || disabled) return;
    const r = onClick?.(e);
    if (r && typeof (r as any).then === "function") {
      setBusy(true);
      try {
        await (r as Promise<void>);
      } finally {
        setBusy(false);
      }
    }
  };

  return (
    <button
      {...rest}
      disabled={disabled || busy}
      className={`${className || ""} ${busy ? "loading" : ""}`}
      onClick={handle}
    >
      {busy ? (
        <>
          <span className="spin" /> {loadingText}
        </>
      ) : (
        children
      )}
    </button>
  );
}
