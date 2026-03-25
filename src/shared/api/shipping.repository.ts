export type City = {
  code: number | string;
  name: string;
  region?: string;
};

export type PickupPoint = {
  code: string;
  name: string;
  address?: string;
  city?: string;
  work_time?: string;
};

export type DeliveryQuote = {
  tariffName: string;
  price: number;
  periodMinDays?: number;
  periodMaxDays?: number;
};

export interface ShippingRepository {
  searchCities(q: string): Promise<City[]>;
  getPickupPoints(cityCode: number | string): Promise<PickupPoint[]>;
  calcDelivery(params: {
    originProfile?: "ODN" | "YAN";
    packagingPreset?: "A2" | "A3" | "A4";
    cityCode: number | string;
    type: "pickup" | "door";
    weightGrams: number;
    declaredValueRub: number;
    lengthCm?: number;
    widthCm?: number;
    heightCm?: number;
  }): Promise<DeliveryQuote[]>;
}
