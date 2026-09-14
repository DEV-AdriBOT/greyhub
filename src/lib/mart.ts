export const martFoods = [
  { id: "apple", name: "Red Apple", price: 2.25, code: "A1" },
  { id: "bread", name: "Fresh Bread", price: 3.5, code: "A2" },
  { id: "cooked_beef", name: "Cooked Beef", price: 6.75, code: "B1" },
  { id: "baked_potato", name: "Baked Potato", price: 3.25, code: "B2" },
  { id: "golden_carrot", name: "Golden Carrot", price: 8.5, code: "C1" },
  { id: "pumpkin_pie", name: "Pumpkin Pie", price: 4.75, code: "C2" },
  { id: "cookie", name: "Cookie", price: 1.75, code: "D1" },
  { id: "melon_slice", name: "Melon Slice", price: 2, code: "D2" },
] as const;

export function martTotal(foodIds: string[], memberPass: boolean) {
  const subtotal = foodIds.reduce(
    (sum, foodId) =>
      sum + (martFoods.find((food) => food.id === foodId)?.price ?? 0),
    0,
  );
  return memberPass ? subtotal * 0.9 : subtotal;
}
