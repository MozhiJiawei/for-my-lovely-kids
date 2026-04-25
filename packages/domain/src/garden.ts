export type GardenStageName = "seed" | "sprout" | "bloom";

export type GardenStage = {
  name: GardenStageName;
  cumulativeFrom: number;
  cumulativeTo: number | null;
};

export type MemorialDecorationKind = "wish_memorial";

export type MemorialDecoration = {
  id: string;
  wishRedemptionId: string;
  kind: MemorialDecorationKind;
  createdAt: string;
};

export type Garden = {
  stage: GardenStage;
  memorialDecorations: MemorialDecoration[];
};

export function getGardenStage(cumulativeRedFlowers: number): GardenStage {
  if (cumulativeRedFlowers >= 20) {
    return {
      name: "bloom",
      cumulativeFrom: 20,
      cumulativeTo: null,
    };
  }

  if (cumulativeRedFlowers >= 8) {
    return {
      name: "sprout",
      cumulativeFrom: 8,
      cumulativeTo: 19,
    };
  }

  return {
    name: "seed",
    cumulativeFrom: 0,
    cumulativeTo: 7,
  };
}

export function createGarden(cumulativeRedFlowers: number): Garden {
  return {
    stage: getGardenStage(cumulativeRedFlowers),
    memorialDecorations: [],
  };
}

export function addWishMemorialDecoration(
  garden: Garden,
  input: {
    decorationId: string;
    wishRedemptionId: string;
    createdAt: string;
    cumulativeRedFlowers: number;
  },
): Garden {
  return {
    stage: getGardenStage(input.cumulativeRedFlowers),
    memorialDecorations: [
      ...garden.memorialDecorations,
      {
        id: input.decorationId,
        wishRedemptionId: input.wishRedemptionId,
        kind: "wish_memorial",
        createdAt: input.createdAt,
      },
    ],
  };
}
