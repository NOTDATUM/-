"use client";

import {
  useEffect,
  useRef,
  type CSSProperties,
} from "react";
import type { Stock } from "../game-data";

export function ViewCompanyPresentation({
  stock,
  price,
  onClose,
}: {
  stock: Stock;
  price: number | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const headingId = `view-company-${stock.ticker}-title`;
  const descriptionId = `view-company-${stock.ticker}-description`;

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const dialog = dialogRef.current;
    let animationFrame = 0;

    if (dialog && !dialog.open) dialog.showModal();
    animationFrame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
      if (dialog?.open) dialog.close();
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
      else document.querySelector<HTMLElement>("#main-content")?.focus();
    };
  }, [stock.ticker]);

  return (
    <dialog
      ref={dialogRef}
      id="view-company-dialog"
      className="view-company-dialog"
      aria-labelledby={headingId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <article
        className="view-company-presentation"
        style={{ "--company-accent": stock.color } as CSSProperties}
      >
        <header>
          <div>
            <i aria-hidden="true" />
            <span>기업 브리핑</span>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="view-company-close"
            aria-label={`${stock.name} 기업 설명 닫기`}
            onClick={onClose}
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className="view-company-content">
          <section className="view-company-identity">
            <span>{stock.field}</span>
            <p>
              <strong>{stock.ticker}</strong>
              {stock.english}
            </p>
            <h2 id={headingId}>{stock.name}</h2>
            <div className="view-company-price">
              <span>기준가</span>
              <strong>
                {price === null
                  ? "공개 전"
                  : `${price.toLocaleString("ko-KR")} BE`}
              </strong>
            </div>
          </section>

          <section className="view-company-overview">
            <span>기업 개요</span>
            <p id={descriptionId}>{stock.description}</p>
            <div className="view-company-revenue">
              <h3>주요 수익원</h3>
              <ul>
                {stock.revenueStreams.map((stream) => (
                  <li key={stream}>{stream}</li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      </article>
    </dialog>
  );
}
