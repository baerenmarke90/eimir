import type { Locator } from '@playwright/test';

export async function renderedContrast(locator: Locator, property = 'color') {
  const pair = await locator.evaluate((element, selectedProperty) => {
    function channels(value: string) {
      return value.match(/[\d.]+/g)?.map(Number) ?? [];
    }
    const layers: number[][] = [];
    for (
      let current: Element | null = element;
      current;
      current = current.parentElement
    ) {
      layers.unshift(channels(getComputedStyle(current).backgroundColor));
    }
    let background = [255, 255, 255];
    for (const layer of layers) {
      const alpha = layer[3] ?? 1;
      background = background.map(
        (channel, index) => layer[index] * alpha + channel * (1 - alpha),
      );
    }
    const foreground = channels(
      getComputedStyle(element).getPropertyValue(selectedProperty),
    );
    const alpha = foreground[3] ?? 1;
    return {
      foreground: background.map(
        (channel, index) => foreground[index] * alpha + channel * (1 - alpha),
      ),
      background,
    };
  }, property);
  function luminance(channels: number[]) {
    const normalized = channels.map((channel) => {
      const value = channel / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    });
    return (
      normalized[0] * 0.2126 + normalized[1] * 0.7152 + normalized[2] * 0.0722
    );
  }
  const first = luminance(pair.foreground);
  const second = luminance(pair.background);
  return {
    ...pair,
    ratio: (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05),
  };
}
