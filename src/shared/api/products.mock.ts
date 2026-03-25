import type { Product } from "../types/product";
import type { ProductsRepository } from "./products.repository";

import p1_1 from "../../assets/products/1/1.jpg";
import p1_2 from "../../assets/products/1/2.jpg";

import p2_1 from "../../assets/products/2/1.jpg";
import p2_2 from "../../assets/products/2/2.jpg";
import p2_3 from "../../assets/products/2/3.jpg";
import p2_4 from "../../assets/products/2/4.jpg";

import p3_1 from "../../assets/products/3/1.jpg";
import p3_2 from "../../assets/products/3/2.jpg";

import p4_1 from "../../assets/products/4/1.jpg";
import p4_2 from "../../assets/products/4/2.jpg";
import p4_3 from "../../assets/products/4/3.jpg";
import p4_4 from "../../assets/products/4/4.jpg";

const MOCK_PRODUCTS: Product[] = [
  {
    id: 1,
    title: "Fred Perry Polo",
    price: 6000,
    oldPrice: 9000,
    images: [p1_1, p1_2],
    isNew: false,
    description: "Classic polo with a clean silhouette and soft feel.",
  },
  {
    id: 2,
    title: "C.P. Company Goggle Jacket",
    price: 17000,
    oldPrice: 21000,
    images: [p2_1, p2_2, p2_3, p2_4],
    isNew: true,
    description: "Technical jacket with a street-ready profile.",
  },
  {
    id: 3,
    title: "Stone Island Knit",
    price: 12000,
    oldPrice: 15000,
    images: [p3_1, p3_2],
    isNew: false,
    description: "Soft knit with a premium finish.",
  },
  {
    id: 4,
    title: "Stone Island Overshirt",
    price: 14000,
    images: [p4_1, p4_2, p4_3, p4_4],
    isNew: false,
    description: "Layer-ready overshirt with a strong texture.",
  },
  {
    id: 5,
    title: "A-COLD-WALL* Utility Hoodie",
    price: 11000,
    oldPrice: 14000,
    images: [
      "https://storage.yandexcloud.net/items-photos-test/IMG_6767.jpeg",
      "https://storage.yandexcloud.net/items-photos-test/IMG_6768.jpeg",
      "https://storage.yandexcloud.net/items-photos-test/IMG_6769.jpeg",
      "https://storage.yandexcloud.net/items-photos-test/IMG_6770.jpeg",
      "https://storage.yandexcloud.net/items-photos-test/IMG_6774.jpeg",
    ],
    isNew: true,
    description: "Structured hoodie with a modern utility edge.",
  },
];

export const mockProductsRepository: ProductsRepository = {
  async getAll() {
    return MOCK_PRODUCTS;
  },
  async getById(id: number) {
    return MOCK_PRODUCTS.find((p) => p.id === id) ?? null;
  },
};
