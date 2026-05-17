/**
 * CSS AST 유틸리티 — @adobe/css-tools 기반 CSS 문자열 안전 수정
 *
 * Why @adobe/css-tools? postcss는 Node 전용 모듈(path, fs, source-map-js)에
 * 의존하여 브라우저 번들에서 Vite externalization 경고가 발생한다.
 * @adobe/css-tools는 순수 JS로 브라우저에서 동기 파싱이 가능하다.
 */

import { CssTypes, parse, stringify } from "@adobe/css-tools";
import type { CssStylesheetAST, CssRuleAST, CssDeclarationAST } from "@adobe/css-tools";

/** 단일 속성 업데이트 (없으면 추가) */
export function updateCssProperty(
  cssText: string,
  selector: string,
  property: string,
  value: string,
): string {
  const ast = parse(cssText, { silent: true });
  const rule = findOrCreateRule(ast, selector);
  updateDecl(rule, property, value);
  return stringify(ast);
}

/** 여러 속성 일괄 업데이트 */
export function batchUpdateCssProperties(
  cssText: string,
  selector: string,
  styles: Record<string, string>,
): string {
  const ast = parse(cssText, { silent: true });
  const rule = findOrCreateRule(ast, selector);
  for (const [prop, val] of Object.entries(styles)) {
    updateDecl(rule, prop, val);
  }
  return stringify(ast);
}

/** 단일 속성 제거 */
export function removeCssProperty(
  cssText: string,
  selector: string,
  property: string,
): string {
  const ast = parse(cssText, { silent: true });
  walkMatchingRules(ast, selector, (rule) => {
    rule.declarations = rule.declarations.filter(
      (d) => !(d.type === CssTypes.declaration && d.property === property),
    );
  });
  return stringify(ast);
}

/** 특정 선택자-속성의 값 조회 */
export function getCssPropertyValue(
  cssText: string,
  selector: string,
  property: string,
): string | undefined {
  const ast = parse(cssText, { silent: true });
  let value: string | undefined;
  walkMatchingRules(ast, selector, (rule) => {
    const decl = rule.declarations.find(
      (d): d is CssDeclarationAST =>
        d.type === CssTypes.declaration && d.property === property,
    );
    if (decl && value === undefined) value = decl.value;
  });
  return value;
}

/** 선택자의 모든 속성을 객체로 조회 */
export function getCssRuleProperties(
  cssText: string,
  selector: string,
): Record<string, string> {
  const ast = parse(cssText, { silent: true });
  const props: Record<string, string> = {};
  walkMatchingRules(ast, selector, (rule) => {
    for (const decl of rule.declarations) {
      if (decl.type === CssTypes.declaration && !(decl.property in props)) {
        props[decl.property] = decl.value;
      }
    }
  });
  return props;
}

/** CSS 전체에서 모든 최상위 선택자 목록 조회 */
export function listCssSelectors(cssText: string): string[] {
  const ast = parse(cssText, { silent: true });
  const selectors: string[] = [];
  for (const rule of ast.stylesheet.rules) {
    if (rule.type === CssTypes.rule) {
      selectors.push(...rule.selectors);
    }
  }
  return selectors;
}

// ─── 내부 헬퍼 ─────────────────────────────────────────────────

function findOrCreateRule(
  ast: CssStylesheetAST,
  selector: string,
): CssRuleAST {
  // 1. Exact match: single-selector rule
  let rule = ast.stylesheet.rules.find(
    (r): r is CssRuleAST =>
      r.type === CssTypes.rule &&
      r.selectors.length === 1 &&
      r.selectors[0] === selector,
  );
  if (rule) return rule;

  // 2. Class-only selector fallback: .myclass matches .parent .myclass
  if (
    selector.startsWith(".") &&
    !selector.includes(" ") &&
    !selector.includes(">")
  ) {
    for (const r of ast.stylesheet.rules) {
      if (r.type === CssTypes.rule) {
        for (const sel of r.selectors) {
          if (sel === selector || sel.includes(selector)) {
            rule = r;
            break;
          }
        }
        if (rule) break;
      }
    }
    if (rule) return rule;
  }

  // 3. Create new rule
  rule = { type: CssTypes.rule, selectors: [selector], declarations: [] };
  ast.stylesheet.rules.push(rule);
  return rule;
}

function updateDecl(rule: CssRuleAST, property: string, value: string) {
  const existing = rule.declarations.find(
    (d): d is CssDeclarationAST =>
      d.type === CssTypes.declaration && d.property === property,
  );
  if (existing) {
    existing.value = value;
  } else {
    rule.declarations.push({ type: CssTypes.declaration, property, value });
  }
}

function walkMatchingRules(
  ast: CssStylesheetAST,
  selector: string,
  callback: (rule: CssRuleAST) => void,
) {
  const isSimpleClass =
    selector.startsWith(".") &&
    !selector.includes(" ") &&
    !selector.includes(">");

  for (const rule of ast.stylesheet.rules) {
    if (rule.type !== CssTypes.rule) continue;

    if (rule.selectors.length === 1 && rule.selectors[0] === selector) {
      callback(rule);
    } else if (isSimpleClass) {
      for (const sel of rule.selectors) {
        if (sel === selector || sel.includes(selector)) {
          callback(rule);
          break;
        }
      }
    }
  }
}
