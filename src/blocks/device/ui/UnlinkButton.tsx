"use client";

// Кнопка «Отвязать» и вопрос под ней (T297).
//
// Само окно общее на продукт (`core/ui/ConfirmDialog`), здесь — только то, что у этой
// кнопки своё: какой планшет, куда ведёт «Отмена» и что сделать с исходом.
//
// Вопрос об этом планшете живёт в адресе (`?confirm=<deviceId>`) — тем же правилом, что
// у справочника и листа QR (см. `catalog/ui/CatalogScreen.tsx`, `qr/ui/ReissueConfirm.tsx`):
// «Отмена» и Esc внутри общего окна меняют адрес (`cancelHref`), а не память компонента,
// и без этого правила они не закрывали бы ничего.
//
// Само действие (`unlinkDevice`) не спрашивает подтверждения второй раз, в отличие от
// перевыпуска кода в справочнике: вопрос целиком на этой кнопке, а не в действии, и
// после согласия строка удаляется сразу. Поэтому — в отличие от остальных опасных
// действий продукта — подтверждение здесь не работает без JavaScript: решить, показать
// ли `device.admin.failed`, может только кнопка, получившая ответ действия, а не адрес.
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactElement } from "react";

import { ConfirmDialog } from "@/blocks/core/ui/ConfirmDialog";

import { unlinkDevice } from "./unlink-action";

const ACTION_NAME = "unlink";

const BTN_GHOST_SM_CLASS =
  "normal-case inline-flex h-[var(--control-h-sm)] items-center justify-center gap-[var(--space-4)] rounded-[var(--r-control)] border border-transparent bg-transparent px-[var(--space-5)] text-[length:var(--fs-dense)] font-medium text-[var(--ink-2)] no-underline hover:bg-[var(--surface-3)] hover:text-ink";

interface UnlinkButtonTexts {
  readonly unlink: string;
  readonly title: string;
  readonly warning: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
}

export interface UnlinkButtonProps {
  readonly deviceId: string;
  /** Открыт ли вопрос про ЭТОТ планшет сейчас — решает адрес (`?confirm=<deviceId>`). */
  readonly open: boolean;
  /** Адрес экрана без параметров — корень для ссылок «открыть», «отмена», «отказ». */
  readonly devicesPath: string;
  readonly texts: UnlinkButtonTexts;
}

export function UnlinkButton({
  deviceId,
  open,
  devicesPath,
  texts,
}: UnlinkButtonProps): ReactElement {
  const router = useRouter();

  const openHref = `${devicesPath}?confirm=${encodeURIComponent(deviceId)}`;
  const closeHref = devicesPath;
  const failedHref = `${devicesPath}?failed=1`;

  // Обычная асинхронная функция, а не серверное действие: `unlinkDevice` уже отработало
  // и вернуло исход, а куда вести дальше — решает эта кнопка. Из-за этого, в отличие от
  // остальных опасных действий продукта, подтверждение здесь требует JavaScript —
  // ничего не подставляемого в `<form action>` как обычный POST тут нет.
  async function handleConfirm(): Promise<void> {
    const outcome = await unlinkDevice(deviceId);
    router.push(outcome.ok ? closeHref : failedHref);
  }

  return (
    <>
      {/* Ссылка, а не кнопка на клике: открытие вопроса — переход по адресу с
          `?confirm=`, роутером Next, как «Перевыпустить» ведёт на лист печати. */}
      <Link
        href={openHref}
        data-testid="device-unlink"
        className={BTN_GHOST_SM_CLASS}
      >
        {texts.unlink}
      </Link>
      {open ? (
        <ConfirmDialog
          name={ACTION_NAME}
          action={handleConfirm}
          fields={{}}
          title={texts.title}
          warning={texts.warning}
          confirmLabel={texts.confirmLabel}
          cancelLabel={texts.cancelLabel}
          cancelHref={closeHref}
        />
      ) : null}
    </>
  );
}
