import { expect, test } from "@playwright/test";

test("página inicial carrega", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Plataforma de Redação" }),
  ).toBeVisible();
});
