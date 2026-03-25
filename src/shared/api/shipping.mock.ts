import type { ShippingRepository } from "./shipping.repository";

export const mockShippingRepository: ShippingRepository = {
  async searchCities(q) {
    const all = [
      { code: 1, name: "Москва" },
      { code: 2, name: "Санкт-Петербург" },
      { code: 3, name: "Казань" },
    ];
    const s = q.trim().toLowerCase();
    return all.filter((c) => c.name.toLowerCase().includes(s));
  },

  async getPickupPoints(cityCode) {
    if (cityCode === 1) {
      return [
        { code: "PVZ-1", name: "CDEK ПВЗ #1", address: "Тверская 10", city: "Москва" },
        { code: "PVZ-2", name: "CDEK ПВЗ #2", address: "Арбат 5", city: "Москва" },
      ];
    }
    return [];
  },

  async calcDelivery() {
    return [
      { tariffName: "Эконом", price: 390, periodMinDays: 2, periodMaxDays: 4 },
      { tariffName: "Стандарт", price: 590, periodMinDays: 1, periodMaxDays: 3 },
    ];
  },
};
