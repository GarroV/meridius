import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { LiveStationCode } from "./LiveStationCode";
import type { QrScreenModel } from "./model";

/**
 * Полноэкранный QR станции — то, что открывают на планшете у самой станции
 * (D006: код выводится на экран, а не только печатается).
 *
 * Экран построен как карточка планшета из эталона `qr-sheet.html`, растянутая на
 * всё окно: код, под ним название станции крупно и пиццерия подписью. Больше на
 * этом экране нет ничего — его смотрят с вытянутой руки и мимоходом.
 *
 * Картинка вставляется разметкой сервера (`dangerouslySetInnerHTML`), и это
 * безопасно ровно потому, что в ней нет ничего от пользователя: `stationQrSvg`
 * выдаёт только геометрию, без текста и без ссылок.
 *
 * ЯЗЫК — ПИЦЦЕРИИ, а не того, кто открыл экран (T273, D122). Экран открывают из
 * кабинета один раз и оставляют висеть у станции: дальше его читает сотрудник на
 * кухне, и подпись «К листу печати» вместе с подписью кода принадлежат ему. Ответ
 * тот же, что у печатной наклейки, и от того же правила — иначе наклейка и планшет
 * одной станции говорили бы на разных языках. Объявлен он атрибутом `lang` на корне
 * содержимого, в отданном HTML.
 */
export async function StationScreen({
  model,
}: {
  readonly model: QrScreenModel;
}): Promise<ReactElement> {
  const t = await getTranslations({ locale: model.locale, namespace: "qr" });

  return (
    <div
      data-testid="station-screen"
      lang={model.locale}
      className="bg-surface flex min-h-screen flex-col items-center justify-center gap-[var(--space-8)] p-[var(--space-9)]"
    >
      <LiveStationCode codeHref={model.codeHref} code={model.code} />

      <div
        data-testid="station-qr"
        role="img"
        aria-label={t("screen.qrLabel", { station: model.stationName })}
        className="h-[min(62vh,62vw)] w-[min(62vh,62vw)]"
        dangerouslySetInnerHTML={{ __html: model.svg }}
      />

      <div className="flex flex-col items-center gap-[var(--space-3)]">
        <div className="text-[length:var(--fs-display)] leading-[var(--lh-display)] font-semibold">
          {model.stationName}
        </div>
        <div className="text-[length:var(--fs-meta)] text-[var(--ink-3)]">
          {model.storeName}
        </div>
      </div>

      <Link
        href={model.backHref}
        className="fixed top-[var(--space-6)] left-[var(--space-6)] text-[length:var(--fs-meta)] text-[var(--ink-3)] no-underline hover:text-[var(--ink-2)]"
      >
        {t("screen.back")}
      </Link>
    </div>
  );
}
