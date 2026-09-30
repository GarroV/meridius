// Состояние главной в адресе (D174): те же параметры, что у ленты (страна, пиццерия,
// станция, период), чтобы суженную главную можно было отправить ссылкой, а переход в
// «Заполнения» сохранял область. Отличие одно — умолчание периода: лента по умолчанию
// показывает сегодня, а пульт — неделю, иначе утром все цифры главной нулевые.
import { ADMIN_HOME } from "@/blocks/core/admin-sections";
import { isFeedPeriod, type FeedPeriod } from "@/blocks/feed/period";
import {
  COUNTRY_PARAM,
  PERIOD_PARAM,
  STATION_PARAM,
  STORE_PARAM,
  parseFeedView,
  type FeedView,
  type SearchParams,
} from "@/blocks/feed/view";

const HOME_DEFAULT_PERIOD: FeedPeriod = "week";

export function parseHomeView(params: SearchParams): FeedView {
  const view = parseFeedView(params);
  const raw = params[PERIOD_PARAM];
  const period = Array.isArray(raw) ? raw[0] : raw;
  return isFeedPeriod(period) ? view : { ...view, period: HOME_DEFAULT_PERIOD };
}

/** Адрес главной с заданной областью. Умолчания в адрес не попадают. */
export function homeHref(view: Partial<FeedView>): string {
  const query = new URLSearchParams();
  const entries: [string, string | undefined][] = [
    [COUNTRY_PARAM, view.countryId],
    [STORE_PARAM, view.storeId],
    [STATION_PARAM, view.stationId],
    [
      PERIOD_PARAM,
      view.period === undefined || view.period === HOME_DEFAULT_PERIOD
        ? undefined
        : view.period,
    ],
  ];
  for (const [key, value] of entries) {
    if (value !== undefined && value !== "") query.set(key, value);
  }
  const search = query.toString();
  return search === "" ? ADMIN_HOME.path : `${ADMIN_HOME.path}?${search}`;
}
