// Read only explicit focus categories and their percentage legends, never prose/reviews.
const categoryNames = new Set([
  "programming & scripting",
  "programming and scripting",
  "programming languages",
  "frameworks and cms",
  "frameworks & cms",
  "frameworks and technologies",
  "cms focus",
  "application platforms",
  "e-commerce systems",
]);
const boundaryNames = new Set([
  ...categoryNames,
  "service lines",
  "services",
  "focus",
  "industries",
  "clients",
  "client size",
  "industry focus",
  "ai expertise",
  "ai technologies & models",
  "cloud computing focus",
  "aws consulting services",
  "azure consulting services",
  "mobile focus",
  "mobile platforms",
  "certified in:",
]);
const normalize = (value: string) =>
  value.replace(/\s+/g, " ").trim().toLowerCase();
const excluded =
  "script,style,noscript,nav,footer,[data-review],.review,.reviews,.recommendations";
function isExcluded(element: Element): boolean {
  if (element.closest(excluded)) return true;
  const aside = element.closest("aside");
  return (
    !!aside &&
    !/select focus area|service lines\s*&\s*focus/i.test(
      aside.textContent ?? "",
    )
  );
}
function tokens(element: Element): string[] {
  const result: string[] = [];
  function visit(node: Node) {
    if (node.nodeType === 3) {
      const text = node.textContent?.replace(/\s+/g, " ").trim();
      if (text) result.push(text);
      return;
    }
    if (node.nodeType !== 1) return;
    const current = node as Element;
    if (isExcluded(current)) return;
    if (current.tagName === "SELECT") {
      const selected = (current as HTMLSelectElement).selectedOptions[0];
      if (selected) result.push(selected.textContent?.trim() ?? "");
      return;
    }
    if (
      current.matches('[role="option"]') &&
      current.getAttribute("aria-selected") !== "true"
    )
      return;
    const text = current.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (boundaryNames.has(normalize(text))) {
      result.push(text);
      return;
    }
    for (const child of current.childNodes) visit(child);
  }
  visit(element);
  // Clutch can render the number and the percent sign in separate spans.
  return result.reduce<string[]>((values, value) => {
    if (value === "%" && /^\d+(?:\.\d+)?$/.test(values.at(-1) ?? ""))
      values[values.length - 1] += "%";
    else values.push(value);
    return values;
  }, []);
}
function labelsInCategory(values: string[]): string[] {
  const result: string[] = [];
  let section: string[] = [];
  let active = false;
  const flush = () => {
    // Legends may put a percentage before or after its label. Use a consistent
    // direction within each category so adjacent rows are never paired twice.
    const percent = /^\d+(?:\.\d+)?\s*%$/;
    const first = section.findIndex((value) => percent.test(value));
    const before = first > 0;
    for (let i = 0; i < section.length; i++) {
      const combined =
        /^(?:(\d+(?:\.\d+)?\s*%)\s+(.+)|(.+?)\s+(\d+(?:\.\d+)?\s*%))$/.exec(
          section[i],
        );
      const label = combined
        ? (combined[2] ?? combined[3])
        : percent.test(section[i])
          ? section[i + (before ? -1 : 1)]
          : undefined;
      if (
        label &&
        label.length <= 120 &&
        !label.includes("%") &&
        !boundaryNames.has(normalize(label)) &&
        !/^\d+$/.test(label)
      )
        result.push(label);
    }
    section = [];
  };
  for (const value of values) {
    const key = normalize(value);
    if (boundaryNames.has(key)) {
      flush();
      active = categoryNames.has(key);
    } else if (active) section.push(value);
  }
  flush();
  return result;
}
export function extractFocusTechnologies(doc: Document): string[] {
  const regions = new Set<Element>();
  for (const element of doc.querySelectorAll(
    "h2,h3,h4,h5,label,legend,button,span,div,p,option,li,a,strong,dt,[role=combobox],[role=option]",
  )) {
    if (
      isExcluded(element) ||
      !categoryNames.has(normalize(element.textContent ?? ""))
    )
      continue;
    if (
      element.tagName === "OPTION" &&
      !(element as HTMLOptionElement).selected
    )
      continue;
    let parent: Element | null = element.parentElement;
    for (
      let depth = 0;
      parent && depth < 16;
      depth++, parent = parent.parentElement
    ) {
      const text = parent.textContent ?? "";
      if (text.length > 60000) break;
      if (/\d\s*%/.test(text)) {
        regions.add(parent);
        break;
      }
    }
  }
  return [...regions].flatMap((region) => labelsInCategory(tokens(region)));
}

export function focusDiagnostics(doc: Document): string {
  const candidates = [
    ...doc.querySelectorAll("label,option,li,button,span,div,h2,h3,h4"),
  ].filter((element) => {
    const text = element.textContent?.replace(/\s+/g, " ").trim() ?? "";
    return (
      text.length < 100 &&
      /programming.{0,12}scripting|frameworks.{0,12}cms/i.test(text) &&
      !element.closest("script,style,noscript")
    );
  });
  const samples = candidates
    .filter(
      (element) =>
        !candidates.some(
          (other) => other !== element && element.contains(other),
        ),
    )
    .slice(0, 4)
    .map((element) => {
      const ancestors = [];
      let parent: Element | null = element;
      for (let i = 0; parent && i < 12; i++, parent = parent.parentElement) {
        ancestors.push({
          tag: parent.tagName,
          id: parent.id,
          class: parent.className,
          textLength: parent.textContent?.length,
          percentages: (parent.textContent?.match(/\d\s*%/g) ?? []).length,
        });
      }
      const region =
        element.closest("section") ??
        element.parentElement?.parentElement ??
        element;
      const clone = region.cloneNode(true) as Element;
      for (const excludedNode of clone.querySelectorAll(
        "script,style,noscript,iframe,img,svg",
      ))
        excludedNode.remove();
      for (const node of [clone, ...clone.querySelectorAll("*")])
        for (const attr of [...node.attributes])
          if (
            ![
              "class",
              "id",
              "role",
              "aria-label",
              "aria-selected",
              "for",
              "type",
              "checked",
              "selected",
            ].includes(attr.name)
          )
            node.removeAttribute(attr.name);
      return { ancestors, html: clone.outerHTML.slice(0, 14000) };
    });
  return JSON.stringify(
    {
      extractorVersion: "focus-v3",
      url: doc.location?.href,
      candidateCount: candidates.length,
      extracted: extractFocusTechnologies(doc),
      samples,
    },
    null,
    2,
  );
}
