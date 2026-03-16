// Mock workers data
// This will be replaced with Supabase queries later
export interface Worker {
  id: number;
  categoryId: number;
  categoryIds: number[];  // Multiple categories (max 3)
  name: string;
  phone: string;
  description: string;
  image: string;
  photos: string[];
  rating: number;          // 0-5 stars
  completedJobs: number;   // Number of completed jobs
}

export const mockWorkers: Worker[] = [
  // Цахилгаан (categoryId: 1)
  {
    id: 1,
    categoryId: 1,
    categoryIds: [1],
    name: 'Бат-Эрдэнэ',
    phone: '99112233',
    description: '10 жилийн туршлагатай цахилгааны мэргэжилтэн. Гэр болон байгууллагын цахилгааны бүх төрлийн ажил хийнэ.',
    image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400',
    photos: [
      'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=600',
      'https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?w=600',
      'https://images.unsplash.com/photo-1621905252507-b35492cc74b4?w=600',
    ],
    rating: 4.8,
    completedJobs: 27,
  },
  {
    id: 2,
    categoryId: 1,
    categoryIds: [1, 2],
    name: 'Дорж',
    phone: '99445566',
    description: 'Орон сууцны цахилгааны шинэчлэл, засвар үйлчилгээ. Цахилгааны самбар угсралт.',
    image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400',
    photos: [
      'https://images.unsplash.com/photo-1621905252472-74a8e0857d21?w=600',
      'https://images.unsplash.com/photo-1621873495896-f8ba7b4f1c5e?w=600',
    ],
    rating: 4.6,
    completedJobs: 15,
  },
  {
    id: 3,
    categoryId: 1,
    categoryIds: [1],
    name: 'Өнөрбаяр',
    phone: '99778899',
    description: '15 жилийн ажлын туршлагатай. Аюулгүй байдлыг эн тэргүүнд тавьдаг.',
    image: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400',
    photos: [
      'https://images.unsplash.com/photo-1621905252507-b35492cc74b4?w=600',
      'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=600',
      'https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?w=600',
      'https://images.unsplash.com/photo-1621873495896-f8ba7b4f1c5e?w=600',
    ],
    rating: 4.9,
    completedJobs: 42,
  },

  // Засал (categoryId: 2)
  {
    id: 4,
    categoryId: 2,
    categoryIds: [2, 5],
    name: 'Болд',
    phone: '99223344',
    description: 'Гэр засвар, өрөө засалт, хана будаг, шалны ажил. Чанартай ажил гүйцэтгэнэ.',
    image: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400',
    photos: [
      'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=600',
      'https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=600',
      'https://images.unsplash.com/photo-1581858726788-75bc0f6a952d?w=600',
    ],
    rating: 4.7,
    completedJobs: 33,
  },
  {
    id: 5,
    categoryId: 2,
    categoryIds: [2, 6],
    name: 'Ганбат',
    phone: '99667788',
    description: 'Тавилга угсралт, засвар. Шалны хучилт, хана өнгөлгөө.',
    image: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400',
    photos: [
      'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=600',
      'https://images.unsplash.com/photo-1534237710431-e2fc698436d0?w=600',
    ],
    rating: 4.5,
    completedJobs: 19,
  },

  // Өрлөг (categoryId: 3)
  {
    id: 6,
    categoryId: 3,
    categoryIds: [3],
    name: 'Цэнд',
    phone: '99334455',
    description: 'Өрлөгийн бүх төрлийн ажил. Их цагаан болон байгууллагын өрлөгийн үйлчилгээ.',
    image: 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=400',
    photos: [
      'https://images.unsplash.com/photo-1563298723-dcfebaa392e3?w=600',
      'https://images.unsplash.com/photo-1504805572947-34fad45aed93?w=600',
      'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=600',
    ],
    rating: 4.9,
    completedJobs: 51,
  },
  {
    id: 7,
    categoryId: 3,
    categoryIds: [3],
    name: 'Пүрэв',
    phone: '99556677',
    description: 'Гэр өрлөг, нарийн цэвэрлэгээ. Ариун цэврийн материал өөрөө авчирдаг.',
    image: 'https://images.unsplash.com/photo-1463453091185-61582044d556?w=400',
    photos: [
      'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=600',
      'https://images.unsplash.com/photo-1628177142898-93e36e4e3a50?w=600',
    ],
    rating: 4.8,
    completedJobs: 38,
  },
  {
    id: 8,
    categoryId: 3,
    categoryIds: [3],
    name: 'Алтан',
    phone: '99889900',
    description: 'Их цагааны өрлөг, цонх угаалга, шалны угаалга.',
    image: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=400',
    photos: [
      'https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?w=600',
      'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=600',
      'https://images.unsplash.com/photo-1628177142898-93e36e4e3a50?w=600',
    ],
    rating: 4.6,
    completedJobs: 22,
  },
  {
    id: 9,
    categoryId: 3,
    categoryIds: [3],
    name: 'Сайнбаяр',
    phone: '99001122',
    description: 'Байгууллагын өрлөгийн үйлчилгээ. 5 жилийн туршлагатай.',
    image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400',
    photos: [
      'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=600',
      'https://images.unsplash.com/photo-1563298723-dcfebaa392e3?w=600',
    ],
    rating: 4.4,
    completedJobs: 14,
  },

  // Сантехник (categoryId: 4)
  {
    id: 10,
    categoryId: 4,
    categoryIds: [4],
    name: 'Мөнх',
    phone: '99123456',
    description: 'Ус сантехникийн бүх төрлийн ажил. Угаалтуур, бохир ус угсралт.',
    image: 'https://images.unsplash.com/photo-1520409364224-63400afe26e5?w=400',
    photos: [
      'https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?w=600',
      'https://images.unsplash.com/photo-1585704032915-c3400ca199e7?w=600',
    ],
    rating: 4.7,
    completedJobs: 29,
  },
  {
    id: 11,
    categoryId: 4,
    categoryIds: [4, 1],
    name: 'Энхбат',
    phone: '99765432',
    description: 'Халаалтын систем, ус дулаан угсралт, засвар.',
    image: 'https://images.unsplash.com/photo-1521119989659-a83eee488004?w=400',
    photos: [
      'https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?w=600',
      'https://images.unsplash.com/photo-1581858726788-75bc0f6a952d?w=600',
      'https://images.unsplash.com/photo-1585704032915-c3400ca199e7?w=600',
    ],
    rating: 4.8,
    completedJobs: 35,
  },

  // Будаг (categoryId: 5)
  {
    id: 12,
    categoryId: 5,
    categoryIds: [5],
    name: 'Батаа',
    phone: '99234567',
    description: 'Гадна дотны будаг, декор. Өндөр чанартай ажил.',
    image: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=400',
    photos: [
      'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=600',
      'https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=600',
    ],
    rating: 4.9,
    completedJobs: 47,
  },
  {
    id: 13,
    categoryId: 5,
    categoryIds: [5, 2],
    name: 'Төмөр',
    phone: '99876543',
    description: 'Хана будаг, өнгөлгөө. 8 жилийн туршлага.',
    image: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=400',
    photos: [
      'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=600',
      'https://images.unsplash.com/photo-1504805572947-34fad45aed93?w=600',
      'https://images.unsplash.com/photo-1534237710431-e2fc698436d0?w=600',
    ],
    rating: 4.5,
    completedJobs: 21,
  },
  {
    id: 14,
    categoryId: 5,
    categoryIds: [5],
    name: 'Баяр',
    phone: '99345678',
    description: 'Байшингийн гадна будаг, зуухны будаг.',
    image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400',
    photos: [
      'https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=600',
      'https://images.unsplash.com/photo-1581858726788-75bc0f6a952d?w=600',
    ],
    rating: 4.6,
    completedJobs: 18,
  },

  // Мебель (categoryId: 6)
  {
    id: 15,
    categoryId: 6,
    categoryIds: [6],
    name: 'Жавхлан',
    phone: '99456789',
    description: 'Мебель угсралт, засвар. Модны бүх төрлийн ажил.',
    image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400',
    photos: [
      'https://images.unsplash.com/photo-1581858726788-75bc0f6a952d?w=600',
      'https://images.unsplash.com/photo-1534237710431-e2fc698436d0?w=600',
    ],
    rating: 4.7,
    completedJobs: 24,
  },
  {
    id: 16,
    categoryId: 6,
    categoryIds: [6, 2],
    name: 'Тулга',
    phone: '99567890',
    description: 'Гал тогоо, шүүгээ угсралт. Захиалгат тавилга.',
    image: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400',
    photos: [
      'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=600',
      'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=600',
      'https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=600',
    ],
    rating: 4.8,
    completedJobs: 31,
  },
];