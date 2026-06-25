// All static data for the platform. In production, this is fetched from an API.
// Admin populates this via the backend CMS — customers & providers never write here.

export type Review = {
  author: string;
  avatar: string; // initial letter used as fallback
  rating: number;
  text: string;
  date: string;
  district: string;
  verified?: boolean; // true = submitted by a real customer on a completed lead
};

export type Project = {
  title: string;
  img: string;
  description: string;
  year: string;
};

export type Company = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  about: string;
  logo: string;
  cover: string;
  category: string;    // primary category slug
  categoryLabel: string;
  services: string[];
  rating: number;
  reviewCount: number;
  completedProjects: number;
  gallery: string[];
  projects: Project[];
  reviews: Review[];
  phone: string;
  location: string;
  // Trust signals (admin-set)
  yearsExperience: number;
  responseTime: string;   // e.g. "within 2 hours"
  verifiedSince: string;  // e.g. "2021"
  badges: string[];       // e.g. ["Licensed", "Award-Winning"]
  featured?: boolean;     // show in home "Featured Companies" (default: true)
  verified?: boolean;     // admin-controlled verified badge (default: false for new companies)
};

export type ServiceCategory = {
  slug: string;
  label: string;
  icon: string;
  description: string;
  count: number;
  cover: string;
};

// ─── Images ──────────────────────────────────────────────────────────────────
const IMG = {
  interior1: "/img/seed-01.jpg",
  interior2: "/img/seed-02.jpg",
  smartHome: "/img/seed-03.jpg",
  landscape: "/img/seed-04.jpg",
  penthouse: "/img/seed-05.jpg",
  corporate: "/img/seed-06.jpg",
  greenRiver: "/img/seed-07.jpg",
  bathroom: "/img/seed-08.jpg",
  techHub: "/img/seed-09.jpg",
  lobby: "/img/seed-10.jpg",
  meeting: "/img/seed-11.jpg",
  logo1: "/img/seed-12.jpg",
  logo2: "/img/seed-13.jpg",
  logo3: "/img/seed-14.jpg",
  logo4: "/img/seed-15.jpg",
};

// ─── Service Categories ───────────────────────────────────────────────────────
export const SERVICE_CATEGORIES: ServiceCategory[] = [
  { slug: "interior-finishing", label: "Interior & Finishing", icon: "architecture", description: "Complete design and execution for residential and commercial spaces.", count: 8, cover: IMG.interior2 },
  { slug: "smart-home", label: "Smart Home & Security", icon: "smart_toy", description: "Automation, CCTV, access control, and climate management.", count: 5, cover: IMG.smartHome },
  { slug: "landscape", label: "Landscape & Outdoor", icon: "park", description: "Award-winning landscape architecture, pools, and outdoor living.", count: 6, cover: IMG.landscape },
  { slug: "furniture", label: "Furniture & Decor", icon: "chair", description: "Premium custom furniture, styling, and home accessories.", count: 7, cover: IMG.interior1 },
  { slug: "construction", label: "Construction & Build", icon: "construction", description: "Structural work, fit-out, and turnkey construction.", count: 4, cover: IMG.lobby },
  { slug: "moving", label: "Moving Services", icon: "local_shipping", description: "Professional residential and corporate relocation.", count: 3, cover: IMG.corporate },
];

// ─── Companies ────────────────────────────────────────────────────────────────
export const COMPANIES: Company[] = [
  {
    id: "1",
    slug: "aura-interiors",
    name: "Aura Interiors",
    tagline: "Where luxury meets precision",
    about: "Aura Interiors is an award-winning interior design and finishing studio with over 12 years of experience in the New Administrative Capital. We deliver bespoke, end-to-end interior solutions for luxury apartments, villas, and corporate spaces — from concept to final key handover.",
    logo: IMG.logo1,
    cover: IMG.interior1,
    category: "interior-finishing",
    categoryLabel: "Interior & Finishing",
    services: ["Full Interior Design", "Residential Finishing", "Commercial Fit-Out", "Custom Furniture", "Lighting Design", "Material Sourcing"],
    rating: 4.9,
    reviewCount: 124,
    completedProjects: 87,
    phone: "+20 100 123 4567",
    location: "New Administrative Capital",
    yearsExperience: 12,
    responseTime: "within 2 hours",
    verifiedSince: "2021",
    badges: ["Award-Winning", "Licensed", "Insured"],
    verified: true,
    gallery: [IMG.interior2, IMG.bathroom, IMG.greenRiver, IMG.meeting, IMG.interior1, IMG.penthouse],
    projects: [
      { title: "The Iconic Tower Penthouse", img: IMG.penthouse, description: "Full interior fit-out for a 420m² luxury penthouse with bespoke joinery and Italian marble.", year: "2024" },
      { title: "Green River Villa", img: IMG.greenRiver, description: "Contemporary interior concept for a 600m² villa featuring sustainable materials and natural finishes.", year: "2023" },
      { title: "Executive Spa Suite", img: IMG.bathroom, description: "High-end spa bathroom featuring Calacatta marble and brushed gold fixtures.", year: "2023" },
    ],
    reviews: [
      { author: "Mohamed A.", avatar: "M", rating: 5, text: "Exceptional work. Aura transformed our villa into something straight out of a magazine. Every detail was perfect and on-schedule.", date: "March 2024", district: "R7" },
      { author: "Sarah K.", avatar: "S", rating: 5, text: "Professional, punctual, and incredibly talented. The team listened to every requirement and exceeded all expectations.", date: "January 2024", district: "CBD" },
      { author: "Ahmed T.", avatar: "A", rating: 5, text: "We hired Aura for our corporate office and the result was breathtaking. Highly recommended for anyone who values quality.", date: "November 2023", district: "R8" },
    ],
  },
  {
    id: "2",
    slug: "nextech-living",
    name: "NexTech Living",
    tagline: "Intelligent homes, effortless living",
    about: "NexTech Living is Egypt's premier smart home integration company, specialising in KNX, Crestron, and Lutron systems. We design, install, and maintain fully automated homes and commercial buildings that deliver security, comfort, and energy efficiency.",
    logo: IMG.logo2,
    cover: IMG.smartHome,
    category: "smart-home",
    categoryLabel: "Smart Home & Security",
    services: ["Full Home Automation", "CCTV & Security", "Access Control", "Smart Lighting", "Climate Automation", "AV & Cinema Rooms"],
    rating: 4.8,
    reviewCount: 96,
    completedProjects: 65,
    phone: "+20 100 234 5678",
    location: "New Administrative Capital",
    yearsExperience: 9,
    responseTime: "within 3 hours",
    verifiedSince: "2022",
    badges: ["KNX Certified", "Licensed", "5-Year Warranty"],
    verified: true,
    gallery: [IMG.smartHome, IMG.lobby, IMG.techHub, IMG.corporate, IMG.meeting, IMG.interior2],
    projects: [
      { title: "Smart Villa R7", img: IMG.smartHome, description: "Complete KNX automation for a 5-bedroom villa: lighting, climate, blinds, and full security integration.", year: "2024" },
      { title: "CBD Office Tower", img: IMG.techHub, description: "Building-wide BMS and access control for a 22-floor commercial tower.", year: "2023" },
      { title: "Private Cinema Suite", img: IMG.lobby, description: "Dedicated 4K Dolby Atmos home cinema with Crestron control and acoustic finishing.", year: "2023" },
    ],
    reviews: [
      { author: "Khaled R.", avatar: "K", rating: 5, text: "Our home is now fully automated — lighting, AC, security, everything from one app. NexTech delivered flawlessly.", date: "February 2024", district: "R7" },
      { author: "Layla M.", avatar: "L", rating: 5, text: "The CCTV and smart lock system they installed gives us complete peace of mind. Excellent after-sales support too.", date: "December 2023", district: "R8" },
      { author: "Omar F.", avatar: "O", rating: 4, text: "Great technical team. Installation was clean and the system works perfectly. Very happy with the result.", date: "October 2023", district: "CBD" },
    ],
  },
  {
    id: "3",
    slug: "eden-landscapes",
    name: "Eden Landscapes",
    tagline: "Nature, designed to perfection",
    about: "Eden Landscapes is a landscape architecture firm creating sustainable outdoor environments across the New Administrative Capital. From private villa gardens and rooftop terraces to community parks and water features, we blend aesthetics with ecology.",
    logo: IMG.logo3,
    cover: IMG.landscape,
    category: "landscape",
    categoryLabel: "Landscape & Outdoor",
    services: ["Landscape Design", "Pool & Water Features", "Outdoor Lighting", "Irrigation Systems", "Rooftop Gardens", "Hardscaping"],
    rating: 5.0,
    reviewCount: 89,
    completedProjects: 54,
    phone: "+20 100 345 6789",
    location: "New Administrative Capital",
    yearsExperience: 8,
    responseTime: "within 4 hours",
    verifiedSince: "2022",
    badges: ["Sustainable Certified", "Award-Winning", "Insured"],
    verified: true,
    gallery: [IMG.landscape, IMG.greenRiver, IMG.penthouse, IMG.interior2, IMG.corporate, IMG.bathroom],
    projects: [
      { title: "Diplomatic Quarter Garden", img: IMG.landscape, description: "Formal English garden with a natural stone pool, mature trees, and automated irrigation across 2,000m².", year: "2024" },
      { title: "Green River Terrace", img: IMG.greenRiver, description: "Rooftop garden with pergola, vertical planters, and integrated mood lighting for a luxury apartment.", year: "2023" },
      { title: "R7 Villa Grounds", img: IMG.penthouse, description: "Contemporary landscape design combining local plants, travertine paving, and a lap pool.", year: "2023" },
    ],
    reviews: [
      { author: "Rania S.", avatar: "R", rating: 5, text: "Eden turned our empty plot into a stunning garden. The pool and planters are exactly what we imagined — and better.", date: "April 2024", district: "Diplomatic Quarter" },
      { author: "Hassan N.", avatar: "H", rating: 5, text: "Professional from start to finish. The rooftop garden they designed is the highlight of our home.", date: "January 2024", district: "R7" },
      { author: "Nour A.", avatar: "N", rating: 5, text: "They really understand premium landscaping. Every plant, every stone was chosen with care. Absolutely beautiful.", date: "November 2023", district: "R9" },
    ],
  },
  {
    id: "4",
    slug: "apex-architecture",
    name: "Apex Architecture",
    tagline: "Architecture that defines its era",
    about: "Apex Architecture is a multidisciplinary architecture and design practice with studios in Cairo and the New Administrative Capital. We work on residential, commercial, and mixed-use projects, delivering award-winning design from master planning to interior architecture.",
    logo: IMG.logo4,
    cover: IMG.corporate,
    category: "interior-finishing",
    categoryLabel: "Interior & Finishing",
    services: ["Architectural Design", "Interior Architecture", "Master Planning", "Project Management", "3D Visualization", "Technical Documentation"],
    rating: 4.9,
    reviewCount: 78,
    completedProjects: 102,
    phone: "+20 100 456 7890",
    location: "New Administrative Capital",
    yearsExperience: 15,
    responseTime: "within 1 day",
    verifiedSince: "2020",
    badges: ["LEED Accredited", "Licensed", "Award-Winning"],
    verified: true,
    gallery: [IMG.corporate, IMG.lobby, IMG.meeting, IMG.techHub, IMG.penthouse, IMG.interior2],
    projects: [
      { title: "Almasa Corporate HQ", img: IMG.corporate, description: "55,000m² mixed-use development in the Business District with LEED Gold certification.", year: "2024" },
      { title: "The Apex Tower Renovation", img: IMG.lobby, description: "Full modernisation of a landmark commercial tower — stripping back to structure and reimagining the entire interior.", year: "2023" },
      { title: "Innovation Hub", img: IMG.techHub, description: "Open-plan tech campus for 800 employees featuring flexible workspaces and biophilic design.", year: "2023" },
    ],
    reviews: [
      { author: "Tarek H.", avatar: "T", rating: 5, text: "Apex designed our office building and it became a landmark. The team's vision and execution are world-class.", date: "March 2024", district: "CBD" },
      { author: "Dina W.", avatar: "D", rating: 5, text: "From the first sketch to the ribbon-cutting, Apex handled everything with grace and professionalism.", date: "January 2024", district: "R7" },
      { author: "Sherif B.", avatar: "S", rating: 5, text: "The best architectural firm we have ever worked with. Detail-oriented, creative, and always on deadline.", date: "October 2023", district: "Business District" },
    ],
  },
];

// NOTE: COMPANIES and SERVICE_CATEGORIES above are the SEED catalog.
// The live, admin-editable catalog lives in `catalog.ts`, which seeds from
// these on first run. Read companies/categories via the catalog store
// (getCompanies / useCompanies / getCompany …), not these arrays directly.

// Platform-wide featured content
export const FEATURED_PROJECTS = [
  { title: "The Iconic Tower Penthouse", company: "Aura Interiors", img: IMG.penthouse, category: "Interior & Finishing" },
  { title: "Almasa Corporate HQ", company: "Apex Architecture", img: IMG.corporate, category: "Architecture" },
  { title: "Smart Villa R7", company: "NexTech Living", img: IMG.smartHome, category: "Smart Home" },
  { title: "Green River Terrace", company: "Eden Landscapes", img: IMG.greenRiver, category: "Landscape" },
  { title: "Executive Spa Suite", company: "Aura Interiors", img: IMG.bathroom, category: "Interior & Finishing" },
];

export const HOME_REVIEWS = [
  { author: "Mohamed A.", district: "R7 District", text: "Al Assema connected me with Aura Interiors in minutes. The entire process — from browsing to completion — was seamless. My apartment looks incredible.", rating: 5 },
  { author: "Rania S.", district: "Diplomatic Quarter", text: "I was amazed by the quality of companies on this platform. Every provider was vetted and professional. I felt confident from the very first call.", rating: 5 },
  { author: "Khaled R.", district: "Central Business District", text: "Submitted my request in under two minutes. NexTech Living called me the same day and the installation was done within a week. Exceptional service.", rating: 5 },
];
