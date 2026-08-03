// frontend/src/utils/generateDietPDF.ts
// Client-side PDF generation — no server needed (jsPDF + html2canvas)

export interface PlanDay {
  day: number;
  day_label: string;
  calorie_target: number;
  meals: {
    breakfast:   { foods: string[]; note: string };
    mid_morning: { foods: string[]; note: string };
    lunch:       { foods: string[]; note: string };
    evening:     { foods: string[]; note: string };
    dinner:      { foods: string[]; note: string };
  };
}

export interface WeekPlanForPDF {
  season: string;
  season_label: string;
  goal: string;
  calorie_target: number;
  vegetarian: boolean;
  excluded_foods: string[];
  days: PlanDay[];
  shopping_list?: ShoppingItem[];
}

export interface ShoppingItem {
  name: string;
  category: string;
  times: number;
  total_g: number;
}

/** Build shopping list from 7-day plan */
export function buildShoppingList(plan: WeekPlanForPDF): ShoppingItem[] {
  const counts: Record<string, { category: string; count: number }> = {};
  const MEAL_CATEGORY_GUESS: Record<string, string> = {
    banana:"fruit", apple:"fruit", mango:"fruit", papaya:"fruit", litchi:"fruit",
    watermelon:"fruit", guava:"fruit", pear:"fruit", grape:"fruit", pomegranate:"fruit",
    curd:"dairy", milk:"dairy", paneer:"dairy",
    oats:"grain", wheat:"grain", "brown rice":"grain", bajra:"grain", jowar:"grain",
    lentils:"legume", "moong dal":"legume", chickpeas:"legume", rajma:"legume",
    onion:"vegetable", spinach:"vegetable", carrot:"vegetable", broccoli:"vegetable",
    almonds:"nut", walnuts:"nut", peanuts:"nut", "sesame seeds":"nut",
    egg:"protein", chicken:"protein", salmon:"protein",
  };
  for (const day of plan.days) {
    const allFoods = [
      ...day.meals.breakfast.foods, ...day.meals.mid_morning.foods,
      ...day.meals.lunch.foods, ...day.meals.evening.foods, ...day.meals.dinner.foods,
    ];
    for (const food of allFoods) {
      const key = food.toLowerCase();
      if (!counts[food]) {
        const cat = Object.entries(MEAL_CATEGORY_GUESS).find(([k]) => key.includes(k))?.[1] ?? "other";
        counts[food] = { category: cat, count: 0 };
      }
      counts[food].count++;
    }
  }
  return Object.entries(counts)
    .map(([name, { category, count }]) => ({
      name, category, times: count, total_g: count * 100,
    }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

const SEASON_COLORS: Record<string, string> = {
  spring:"#4ade80", summer:"#f59e0b", monsoon:"#60a5fa",
  autumn:"#f97316", prewinter:"#a78bfa", winter:"#38bdf8", all:"#6ee7b7",
};

/** Inject a hidden printable div, capture it, generate PDF */
export async function generateDietPDF(plan: WeekPlanForPDF): Promise<void> {
  const { default: jsPDF }        = await import("jspdf");
  const { default: html2canvas }  = await import("html2canvas");

  const accentColor = SEASON_COLORS[plan.season] ?? "#6ee7b7";
  const shoppingList = plan.shopping_list ?? buildShoppingList(plan);

  // Build printable HTML
  const el = document.createElement("div");
  el.id = "nm-pdf-printable";
  el.style.cssText = [
    "position:fixed","top:-9999px","left:-9999px",
    "width:794px","background:#fff","font-family:sans-serif",
    "color:#1a1a2e","padding:32px","box-sizing:border-box",
  ].join(";");

  // Each row shows the 5 meals (B/MM/L/E/D) and a proper calorie split
  // not a static 'calorie_target' repeated every row.
  const mealRows = plan.days.map(d => {
    const bk = d.meals.breakfast.foods.join(" + ");
    const mm = d.meals.mid_morning.foods.join(" + ");
    const lu = d.meals.lunch.foods.join(" + ");
    const ev = d.meals.evening.foods.join(" + ");
    const di = d.meals.dinner.foods.join(" + ");
    const ct = d.calorie_target ?? plan.calorie_target;
    return `<tr style="border-bottom:1px solid #f0f0f0">
      <td style="padding:8px 10px;font-weight:700;color:#374151;white-space:nowrap;font-size:12px">${d.day_label}</td>
      <td style="padding:6px;font-size:10px;color:#374151">
        <div>🌅 <b>B:</b> ${bk}</div>
        <div>🍎 <b>MM:</b> ${mm}</div>
        <div>🍱 <b>L:</b> ${lu}</div>
        <div>🫖 <b>E:</b> ${ev}</div>
        <div>🌙 <b>D:</b> ${di}</div>
      </td>
      <td style="padding:6px;font-size:10px;text-align:right;color:#6b7280;vertical-align:top;white-space:nowrap">
        <div>~${Math.round(ct*0.25)} kcal</div>
        <div>~${Math.round(ct*0.10)} kcal</div>
        <div>~${Math.round(ct*0.35)} kcal</div>
        <div>~${Math.round(ct*0.10)} kcal</div>
        <div>~${Math.round(ct*0.20)} kcal</div>
        <div style="margin-top:4px;font-weight:700;color:#374151">= ${ct} kcal</div>
      </td>
    </tr>`;
  }).join("");

  const cats = [...new Set(shoppingList.map(i => i.category))];
  const shopRows = cats.map(cat => {
    const items = shoppingList.filter(i => i.category === cat);
    return `<div style="margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;margin-bottom:4px">${cat}</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${items.map(i => `<span style="background:#f3f4f6;border-radius:20px;padding:3px 10px;font-size:11px">${i.name} <span style="color:#9ca3af">(${i.total_g}g)</span></span>`).join("")}
      </div>
    </div>`;
  }).join("");

  const planHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid ${accentColor}">
      <div>
        <div style="font-size:22px;font-weight:800;color:#1a1a2e">NutriMentor AI</div>
        <div style="font-size:13px;color:#6b7280;margin-top:2px">Your personalised ${plan.season_label} diet plan</div>
      </div>
      <div style="text-align:right">
        <div style="background:${accentColor}22;color:${accentColor};border:1px solid ${accentColor}55;border-radius:20px;padding:4px 14px;font-size:12px;font-weight:600">${plan.season_label}</div>
        <div style="font-size:11px;color:#9ca3af;margin-top:4px">${new Date().toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"})}</div>
      </div>
    </div>

    <div style="display:flex;gap:16px;margin-bottom:24px">
      <div style="flex:1;background:#f9fafb;border-radius:10px;padding:12px 16px">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;font-weight:700">Daily target</div>
        <div style="font-size:20px;font-weight:800;color:#1a1a2e;margin-top:2px">${plan.calorie_target} <span style="font-size:12px;font-weight:400;color:#6b7280">kcal/day</span></div>
      </div>
      <div style="flex:1;background:#f9fafb;border-radius:10px;padding:12px 16px">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;font-weight:700">Goal</div>
        <div style="font-size:16px;font-weight:700;color:#1a1a2e;margin-top:2px;text-transform:capitalize">${plan.goal}</div>
      </div>
      <div style="flex:1;background:#f9fafb;border-radius:10px;padding:12px 16px">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;font-weight:700">Diet type</div>
        <div style="font-size:16px;font-weight:700;color:#1a1a2e;margin-top:2px">${plan.vegetarian ? "Vegetarian" : "Mixed"}</div>
      </div>
    </div>

    <div style="font-size:14px;font-weight:700;margin-bottom:12px">📅 7-Day Meal Plan</div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:8px">
      <thead>
        <tr style="background:#f9fafb">
          <th style="padding:10px;text-align:left;font-size:11px;color:#6b7280;font-weight:700;width:80px">Day</th>
          <th style="padding:10px;text-align:left;font-size:11px;color:#6b7280;font-weight:700">All 5 meals (B · MM · L · E · D)</th>
          <th style="padding:10px;text-align:right;font-size:11px;color:#6b7280;font-weight:700;width:90px">Calories</th>
        </tr>
      </thead>
      <tbody>${mealRows}</tbody>
    </table>
  `;

  const shoppingHTML = `
    <div style="font-size:14px;font-weight:700;margin-bottom:12px">🛒 Shopping List</div>
    ${shopRows}

    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">
      <div style="font-size:11px;color:#9ca3af">All quantities approximate at 100g per food item.</div>
      <div style="font-size:11px;color:#9ca3af">Generated by <strong>NutriMentor AI</strong> · nutrimentor-ai.pages.dev</div>
    </div>
  `;

  el.innerHTML = planHTML;

  const elShopping = document.createElement("div");
  elShopping.id = "nm-pdf-printable-shopping";
  elShopping.style.cssText = el.style.cssText;
  elShopping.innerHTML = shoppingHTML;

  document.body.appendChild(el);
  document.body.appendChild(elShopping);
  try {
    const pdf    = new jsPDF("p", "mm", "a4");
    const w      = pdf.internal.pageSize.getWidth();
    const pageH  = pdf.internal.pageSize.getHeight();

    // Renders one element, sliced into as many pages as it needs, starting a
    // fresh page first unless `firstPage` (used only for the very first call).
    async function renderSection(target: HTMLElement, firstPage: boolean) {
      const canvas  = await html2canvas(target, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      const h       = (canvas.height * w) / canvas.width;
      const pxPerMm = canvas.width / w;
      const pxPageH = pageH * pxPerMm;

      if (canvas.height <= pxPageH) {
        if (!firstPage) pdf.addPage();
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, w, h);
        return;
      }
      let srcY = 0, pageNum = 0;
      while (srcY < canvas.height) {
        const slicePxH = Math.min(pxPageH, canvas.height - srcY);
        const sc = document.createElement("canvas");
        sc.width  = canvas.width;
        sc.height = slicePxH;
        sc.getContext("2d")!.drawImage(canvas, 0, srcY, canvas.width, slicePxH, 0, 0, canvas.width, slicePxH);
        if (!firstPage || pageNum > 0) pdf.addPage();
        const sliceMmH = (slicePxH / pxPerMm);
        pdf.addImage(sc.toDataURL("image/png"), "PNG", 0, 0, w, sliceMmH);
        srcY += slicePxH;
        pageNum++;
      }
    }

    // Plan content: page 1 (and more if it overflows). Shopping list: always
    // starts on its own fresh page after that — this is the actual fix.
    await renderSection(el, true);
    await renderSection(elShopping, false);

    const date = new Date().toLocaleDateString("en-IN").replace(/\//g, "-");
    pdf.save(`NutriMentor_${plan.season}_Plan_${date}.pdf`);
  } finally {
    document.body.removeChild(el);
    document.body.removeChild(elShopping);
  }
}

/** Generate shareable score card as PNG download */
export async function generateScoreCard(
  score: number,
  season: string,
  seasonLabel: string,
  topNutrients: string[],
  lowNutrients: string[]
): Promise<void> {
  const { default: html2canvas } = await import("html2canvas");
  const accentColor = SEASON_COLORS[season] ?? "#6ee7b7";

  // ── Ring math ──────────────────────────────────────────────────────────────
  // Arc starts at 12 o'clock via rotate(-90) on the SVG group.
  // stroke-dashoffset MUST be 0 when using rotate — combining both offsets the
  // start position twice, making 77% look like ~52%.
  const radius = 80;
  const circumference = 2 * Math.PI * radius;           // full circle length
  const dash   = (Math.min(score, 100) / 100) * circumference; // filled arc
  const gap    = circumference - dash;                   // unfilled remainder
  // html2canvas does NOT render SVG <g transform='rotate'> reliably.
  // Use stroke-dashoffset to shift the arc start to 12 o'clock instead.
  // dashoffset = C*0.25 moves the gap from 3 o'clock to 12 o'clock.
  const offset = circumference * 0.25;

  // ── Chips ──────────────────────────────────────────────────────────────────
  const allChips = [
    ...topNutrients.slice(0,3).map(n => ({ label: `✓ ${n}`, good: true })),
    ...lowNutrients.slice(0,2).map(n => ({ label: `↓ ${n}`, good: false })),
  ];
  const chipW = 90; const chipH = 28; const chipGap = 8;
  const totalChipW = allChips.length * chipW + (allChips.length - 1) * chipGap;
  const svgW = Math.max(totalChipW + 32, 380);  // wide enough to never clip
  let cx = (svgW - totalChipW) / 2;
  const chipssvg = allChips.map(chip => {
    const fill   = chip.good ? accentColor + "22" : "#f9731622";
    const stroke = chip.good ? accentColor + "66" : "#f9731666";
    const color  = chip.good ? accentColor        : "#f97316";
    const out = `
      <rect x="${cx}" y="6" width="${chipW}" height="${chipH}" rx="14" ry="14"
        fill="${fill}" stroke="${stroke}" stroke-width="1"/>
      <text x="${cx + chipW/2}" y="${6 + chipH/2}" text-anchor="middle" dominant-baseline="middle"
        fill="${color}" font-size="11" font-family="sans-serif" font-weight="500">${chip.label}</text>`;
    cx += chipW + chipGap;
    return out;
  }).join("");

  // ── Container: auto-height, wide enough, no fixed height to avoid clipping ─
  const el = document.createElement("div");
  el.style.cssText = [
    "position:fixed","top:-9999px","left:0",
    `width:${svgW}px`,
    "background:#0d1117",
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    "display:flex","flex-direction:column",
    "align-items:center",
    "padding:28px 24px 24px",
    "box-sizing:border-box",
    "gap:14px",
  ].join(";");

  el.innerHTML = `
    <div style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;
      color:${accentColor};opacity:.85;margin-bottom:4px">NutriMentor AI</div>

    <svg width="220" height="220" viewBox="0 0 220 220">
      <!-- Track ring -->
      <circle cx="110" cy="110" r="${radius}" fill="none" stroke="#1e2a3a" stroke-width="16"/>
      <!-- Score arc: dashoffset=C*0.25 starts at 12 o'clock (html2canvas safe) -->
      <circle cx="110" cy="110" r="${radius}" fill="none"
        stroke="${accentColor}" stroke-width="16"
        stroke-dasharray="${dash.toFixed(2)} ${gap.toFixed(2)}"
        stroke-dashoffset="${offset.toFixed(2)}"
        stroke-linecap="round"/>
      <!-- Score text -->
      <text x="110" y="103" text-anchor="middle" dominant-baseline="middle"
        fill="white" font-size="40" font-weight="800" font-family="sans-serif">${score}</text>
      <text x="110" y="130" text-anchor="middle" dominant-baseline="middle"
        fill="#6b7280" font-size="14" font-family="sans-serif">/ 100</text>
    </svg>

    <div style="font-size:17px;font-weight:700;color:white;margin-top:2px">My NutriMentor Score</div>
    <div style="font-size:12px;color:#6b7280">${seasonLabel}</div>

    <svg width="${svgW}" height="44" viewBox="0 0 ${svgW} 44">
      ${chipssvg}
    </svg>

    <div style="font-size:10px;color:#4b5563;margin-top:2px">nutrimentor-ai.pages.dev</div>
  `;

  document.body.appendChild(el);
  try {
    // Force layout before capture so scrollWidth reflects full content
    const elW = el.scrollWidth || svgW;
    const elH = el.scrollHeight;
    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#0d1117",
      width:  elW,
      height: elH,
      windowWidth:  elW,
      windowHeight: elH,
    });
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `NutriMentor_Score_${score}.png`;
    a.click();
  } finally {
    document.body.removeChild(el);
  }
}