import { ChecklistsHome } from "@/blocks/editor/ui/ChecklistsHome";

/**
 * Раздел «Чек-листы» без выбранного чек-листа: колонка слева (её рисует
 * `./layout.tsx`), справа — подсказка, что выбрать. Сужение списка (`?country=`,
 * `?store=`, `?station=`, `?q=`) читает сама колонка: странице адрес разбирать незачем.
 */
export default function ChecklistsPage() {
  return <ChecklistsHome />;
}
