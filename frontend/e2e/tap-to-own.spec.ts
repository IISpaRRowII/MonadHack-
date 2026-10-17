// e2e/tap-to-own.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Tap-to-Own — Criterios de Aceptación Hackathon', () => {
  test('Abre sin wallet, muestra los 4 activos, permite comprar/vender en Demo y reiniciar', async ({ page }) => {
    await page.goto('http://localhost:5173');

    // 1. Abre sin wallet en Demo Mode y muestra el lema
    await expect(page.getByText('Own the Moment.')).toBeVisible();
    await page.getByTestId('enter-arena-btn').click();

    // 2. Los 4 activos se muestran correctamente
    await expect(page.getByTestId('asset-card-cafe-montana-dorada')).toBeVisible();
    await expect(page.getByTestId('asset-card-cafe-volcan-rojo')).toBeVisible();
    await expect(page.getByTestId('asset-card-arte-urbano-medellin')).toBeVisible();
    await expect(page.getByTestId('asset-card-local-genesis')).toBeVisible();

    // 3. El jugador compra y vende en Demo y las transacciones llevan prefijo DEMO-
    await page.getByTestId('buy-btn-cafe-montana-dorada').click();
    await expect(page.getByTestId('human-units-cafe-montana-dorada')).toContainText('10 unidades');
    await expect(page.getByText(/DEMO-/)).toBeVisible();

    // 4. Reinicio restablece la partida
    await page.getByTestId('reset-button').click();
    await expect(page.getByTestId('human-units-cafe-montana-dorada')).toContainText('0 unidades');
  });
});