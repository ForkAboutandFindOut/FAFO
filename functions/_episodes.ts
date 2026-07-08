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
  {
    id: "ep006",
    title: "Aarin Popat",
    r2_key: "episodes/ep006.mp3",
    filename: "FAFO_ep006_AarinPopat.mp3",
  },
  {
    id: "ep007",
    title: "Fatema Al Khalifa",
    r2_key: "episodes/ep007.mp3",
    filename: "FAFO_ep007_FatemaAlKhalifa.mp3",
  },
  // ep008 Prince Kumar temporarily hidden — awaiting revised MP3.
  // Restore by uncommenting this block AND the matching article in
  // docs/index.html.
  // {
  //   id: "ep008",
  //   title: "Prince Kumar",
  //   r2_key: "episodes/ep008.mp3",
  //   filename: "FAFO_ep008_PrinceKumar.mp3",
  // },
];
