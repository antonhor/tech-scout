// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { clutchExtractor } from "../src/content/clutchExtractor";
import focus from "./fixtures/focus-sections.html?raw";
const extract = (html: string) =>
  clutchExtractor.extract(
    new DOMParser().parseFromString(html, "text/html"),
    "https://clutch.co/profile/we-create-digital",
  );
describe("focus legends outside the profile header", () => {
  it("reads selected dropdown categories, split percentages, and Objective C", () => {
    const r = extract(
      "<section><select><option>AI Expertise</option><option selected>Programming &amp; Scripting</option></select><ul><li><a>Kotlin</a><span>35</span><span>%</span></li><li><a>Swift</a><span>60</span><span>%</span></li><li><span>Objective C</span><span>5</span><span>%</span></li></ul></section>",
    );
    expect(r.agency.programmingLanguages).toEqual([
      "Kotlin",
      "Swift",
      "Objective-C",
    ]);
  });
  it("accepts a real focus sidebar while excluding unrelated sidebars", () => {
    const r = extract(
      "<aside><p>Select Focus Area</p><h3>Programming &amp; Scripting</h3><div>Kotlin 100%</div></aside><aside><h3>Programming &amp; Scripting</h3><div>Java 100%</div></aside>",
    );
    expect(r.agency.programmingLanguages).toEqual(["Kotlin"]);
  });
  it("combines category labels split across nested spans", () => {
    const r = extract(
      "<section><h3><span>Programming</span> &amp; <span>Scripting</span></h3><div>Kotlin 100%</div></section>",
    );
    expect(r.agency.programmingLanguages).toEqual(["Kotlin"]);
  });
  it("stops technology parsing at Mobile Focus categories", () => {
    const r = extract(
      "<section><h3>Frameworks and CMS</h3><div>Flutter 100%</div><h3>Mobile Focus</h3><div>Health App Development 100%</div></section>",
    );
    expect(r.agency.frameworksAndTechnologies).toEqual(["Flutter"]);
  });
  it("recognizes a heading with an embedded dropdown icon", () => {
    const r = extract(
      '<section><h3><button>Programming &amp; Scripting<svg aria-hidden="true"></svg></button></h3><div><a>PHP</a><span>100%</span></div></section>',
    );
    expect(r.agency.programmingLanguages).toEqual(["PHP"]);
  });
  it("extracts languages and frameworks from independent chart categories", () => {
    const result = extract(focus).agency;
    expect(result.programmingLanguages).toEqual(["PHP", "JavaScript", "SQL"]);
    expect(result.frameworksAndTechnologies).toEqual([
      "Laravel",
      "WordPress CMS",
      "HTML & CSS",
      "XML",
    ]);
    expect(result.frameworksAndTechnologies).not.toContain("Web Development");
    expect(result.programmingLanguages).not.toContain("Python");
    expect(result.frameworksAndTechnologies).not.toContain("React");
  });
  it("handles percentages before labels", () => {
    const r = extract(
      "<section><h3>Programming &amp; Scripting</h3><div><span>80%</span><a>PHP</a></div><div><span>20%</span><a>JavaScript</a></div></section>",
    );
    expect(r.agency.programmingLanguages).toEqual(["PHP", "JavaScript"]);
  });
  it("does not infer technologies from description or reviews", () => {
    const r = extract(
      '<main data-company-profile><h1>Example</h1><p>We develop in Python and React.</p></main><section class="reviews"><h3>Frameworks and CMS</h3><div>React <span>100%</span></div></section>',
    );
    expect(r.agency.programmingLanguages).toEqual([]);
    expect(r.agency.frameworksAndTechnologies).toEqual([]);
  });
  it("handles inline legend text and duplicate responsive charts", () => {
    const r = extract(
      "<section><h3>Programming &amp; Scripting</h3><div>PHP 40%</div><div>60% JavaScript</div></section><section><h3>Programming &amp; Scripting</h3><div>PHP 100%</div></section>",
    );
    expect(r.agency.programmingLanguages).toEqual(["PHP", "JavaScript"]);
  });
});
