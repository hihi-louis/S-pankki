/** Nhãn dễ đọc cho MCC (giống frontend/src/lib/format.ts). */
const MCC: Record<number, string> = {
  4121: "Taxi", 4111: "Public transport", 5541: "Fuel", 5542: "Fuel", 7523: "Parking",
  5411: "Supermarket", 5499: "Food shop", 5422: "Butcher", 5451: "Dairy shop",
  5812: "Restaurant", 5813: "Bar", 5814: "Fast food & café",
  7832: "Cinema", 7922: "Tickets & shows", 7999: "Recreation", 7991: "Attractions", 7996: "Amusement park",
  5912: "Pharmacy", 8011: "Doctor", 8021: "Dentist", 8099: "Health service",
  5200: "Home supplies", 5732: "Electronics", 5251: "Hardware", 5712: "Furniture", 5734: "Software",
  5941: "Sports", 5651: "Clothing", 5691: "Clothing", 5942: "Books", 5945: "Toys & games", 5999: "Shopping",
  4722: "Travel agency", 4511: "Flights", 7011: "Hotel", 7512: "Car rental",
};
export const mccLabel = (mcc: number | null | undefined) => (mcc ? MCC[mcc] ?? null : null);
