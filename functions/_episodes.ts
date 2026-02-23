export type Episode = {
  id: string;
  title: string;
  r2_key: string;
  filename: string;
};

export const EPISODES: Episode[] = [
  {
    id: "ep001",
    title: "Leon Kuessner",
    r2_key: "episodes/ep001.mp3",
    filename: "FAFO_ep001_LeonKuessner.mp3",
  },
 {
    id: "ep002",
    title: "Gabriel Szeto",
    r2_key: "episodes/ep002.mp3",
    filename: "FAFO_ep002_GabrielSzeto.mp3",
  },
   {
    id: "ep003",
    title: "Will Lockwood",
    r2_key: "episodes/ep003.mp3",
    filename: "FAFO_ep003_WillLockwood.mp3",
  },
  {
    id: "ep004",
    title: "Tim Issenmann",
    r2_key: "episodes/ep004.mp3",
    filename: "FAFO_ep004_TimIssenmann.mp3",
  },
  {
    id: "ep005",
    title: "Veer Vij",
    r2_key: "episodes/ep005.mp3",
    filename: "FAFO_ep005_VeerVij.mp3",
  },
];
