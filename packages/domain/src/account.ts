import type { Garden } from "./garden";
import type { RedFlowerAccount } from "./red-flowers";
import type { TaskBook } from "./tasks";
import type { WishBook } from "./wishes";

export type ChildProfile = {
  id: string;
  nickname: string;
};

export type FamilyAccount = {
  id: string;
  timezone: string;
  child: ChildProfile;
  taskBook: TaskBook;
  wishBook: WishBook;
  redFlowers: RedFlowerAccount;
  garden: Garden;
};
