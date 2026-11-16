"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { useRouter } from "@/i18n/navigation";

type CityOption = { slug: string; label: string };

/** Date and city chooser for the Panchang. The server passes the limits and the city list in, so
 * this stays a few lines of client code and the engine never ships to the browser. */
export function PanchangPicker({ cities, defaultCity, initialDate, initialCity, minDate, maxDate, minYear, maxYear }: {
  cities: CityOption[]; defaultCity: string; initialDate: string; initialCity: string; minDate: string; maxDate: string; minYear: number; maxYear: number;
}) {
  const t = useTranslations("Panchang");
  const router = useRouter();
  const [date, setDate] = useState(initialDate);
  const [city, setCity] = useState(initialCity);

  function open(event: FormEvent) {
    event.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < minDate || date > maxDate) return;
    router.push(city === defaultCity ? `/panchang/${date}` : `/panchang/${date}/${city}`);
  }

  return (
    <form className="panchang-picker" onSubmit={open}>
      <h3>{t("pickerTitle", { minYear, maxYear })}</h3>
      <p>{t("pickerHint")}</p>
      <div className="panchang-picker__fields">
        <label>
          <span>{t("pickerDate")}</span>
          <input type="date" name="date" required min={minDate} max={maxDate} value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <label>
          <span>{t("pickerCity")}</span>
          <select name="city" value={city} onChange={(event) => setCity(event.target.value)}>
            {cities.map((item) => <option key={item.slug} value={item.slug}>{item.label}</option>)}
          </select>
        </label>
        <button type="submit" className="button button--small">{t("pickerSubmit")} <ArrowRight size={14} /></button>
      </div>
    </form>
  );
}
