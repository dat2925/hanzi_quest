export type Word = { hanzi: string; pinyin: string; meaning: string };
export type Question = {
  type: "quiz" | "listen" | "sentence" | "match" | "tone";
  prompt: string;
  options: string[];
  answer: string;
  explanation: string;
  audio?: string;
};
export type Lesson = {
  id: string;
  title: string;
  description: string;
  guide: string;
  words: Word[];
  questions: Question[];
  writing: string;
  minutes: number;
};
export const words: Word[] = [
  { hanzi: "你好", pinyin: "nǐ hǎo", meaning: "Xin chào" },
  { hanzi: "谢谢", pinyin: "xièxie", meaning: "Cảm ơn" },
  { hanzi: "再见", pinyin: "zàijiàn", meaning: "Tạm biệt" },
  { hanzi: "我", pinyin: "wǒ", meaning: "Tôi" },
  { hanzi: "你", pinyin: "nǐ", meaning: "Bạn" },
  { hanzi: "好", pinyin: "hǎo", meaning: "Tốt" },
  { hanzi: "一", pinyin: "yī", meaning: "Một" },
  { hanzi: "二", pinyin: "èr", meaning: "Hai" },
  { hanzi: "三", pinyin: "sān", meaning: "Ba" },
  { hanzi: "人", pinyin: "rén", meaning: "Người" },
  { hanzi: "口", pinyin: "kǒu", meaning: "Miệng" },
  { hanzi: "日", pinyin: "rì", meaning: "Mặt trời / ngày" },
  { hanzi: "是", pinyin: "shì", meaning: "Là" },
  { hanzi: "学生", pinyin: "xuésheng", meaning: "Học sinh" },
  { hanzi: "中国", pinyin: "Zhōngguó", meaning: "Trung Quốc" },
  { hanzi: "水", pinyin: "shuǐ", meaning: "Nước" },
  { hanzi: "茶", pinyin: "chá", meaning: "Trà" },
  { hanzi: "喜欢", pinyin: "xǐhuan", meaning: "Thích" },
  { hanzi: "因为", pinyin: "yīnwèi", meaning: "Bởi vì" },
  { hanzi: "所以", pinyin: "suǒyǐ", meaning: "Cho nên" },
];
const choice = (word: Word): Question => ({
  type: "quiz",
  prompt: `“${word.hanzi}” có nghĩa là gì?`,
  options: [
    word.meaning,
    ...words
      .filter((w) => w.meaning !== word.meaning)
      .slice(0, 3)
      .map((w) => w.meaning),
  ],
  answer: word.meaning,
  explanation: `${word.hanzi} · ${word.pinyin} → ${word.meaning}.`,
});
const greeting: Question[] = [
  {
    type: "quiz",
    prompt: "Chọn cách nói “Xin chào”",
    options: ["谢谢", "你好", "再见", "中国"],
    answer: "你好",
    explanation: "你好 (nǐ hǎo) là lời chào thông dụng. 你 là bạn, 好 là tốt.",
  },
  {
    type: "listen",
    prompt: "Lắng nghe và chọn điều bạn nghe được",
    audio: "谢谢",
    options: ["你好", "再见", "谢谢", "我"],
    answer: "谢谢",
    explanation:
      "谢谢 (xièxie) nghĩa là cảm ơn. Âm tiết thứ hai mang thanh nhẹ.",
  },
  {
    type: "match",
    prompt: "Ghép lời chào với nghĩa tiếng Việt",
    options: ["你好|Xin chào", "谢谢|Cảm ơn", "再见|Tạm biệt"],
    answer: "matched",
    explanation: "Tuyệt! Bạn đã nhớ ba cách chào hỏi đầu tiên.",
  },
  {
    type: "sentence",
    prompt: "Sắp xếp câu: “Tôi là học sinh”",
    options: ["学生", "是", "我"],
    answer: "我是学生",
    explanation:
      "我 (tôi) + 是 (là) + 学生 (học sinh). Tiếng Trung không chia động từ theo ngôi.",
  },
];
export let lessons: Lesson[] = [
  {
    id: "hello",
    title: "你好! Xin chào, tiếng Trung",
    description: "Những lời chào mở đầu hành trình của bạn.",
    guide:
      "Tiếng Trung dùng chữ Hán để viết và Pinyin để ghi cách đọc. 你好 đọc là nǐ hǎo. Khi hai âm thanh 3 đứng cạnh nhau, âm đầu thường đọc gần thanh 2: ní hǎo. Hãy nghe rồi nói chậm theo từng âm.",
    words: words.slice(0, 3),
    questions: greeting,
    writing:
      "Viết 你 và 好 mỗi chữ 5 lần. Đọc “nǐ hǎo” khi viết. Che mẫu rồi viết lại 你好 một lần và so sánh.",
    minutes: 8,
  },
  {
    id: "pinyin",
    title: "Pinyin · Chiếc chìa khóa phát âm",
    description: "Nhận diện phiên âm và cấu tạo âm tiết.",
    guide:
      "Pinyin là hệ thống phiên âm bằng chữ Latin. Một âm tiết thường gồm thanh mẫu, vận mẫu và dấu thanh: n + i + ˇ = nǐ. Chữ “q” và “x” không đọc giống tiếng Việt. Nghe giọng tiếng Trung trên thiết bị để làm quen, không đoán cách đọc từ chữ Latin.",
    words: words.slice(3, 6),
    questions: [
      {
        type: "quiz",
        prompt: "Phiên âm của 你 là gì?",
        options: ["nǐ", "hǎo", "wǒ", "shì"],
        answer: "nǐ",
        explanation: "你 = nǐ: thanh mẫu n, vận mẫu i, thanh 3.",
      },
      {
        type: "listen",
        prompt: "Âm bạn nghe thuộc chữ nào?",
        audio: "我",
        options: ["我", "你", "好", "是"],
        answer: "我",
        explanation: "我 đọc là wǒ, nghĩa là tôi.",
      },
      ...words.slice(3, 5).map(choice),
    ],
    writing:
      "Ghi ba cột: chữ Hán — Pinyin — nghĩa. Viết 你 nǐ, 我 wǒ, 好 hǎo mỗi từ 3 lần.",
    minutes: 10,
  },
  {
    id: "tones",
    title: "Giai điệu của bốn thanh",
    description: "Cùng một âm, thanh điệu khác, nghĩa khác.",
    guide:
      "Thanh 1: cao và ngang (mā). Thanh 2: đi lên (má). Thanh 3: xuống thấp rồi lên (mǎ; thường chỉ thấp trong câu). Thanh 4: đi xuống mạnh (mà). Thanh nhẹ: ngắn và nhẹ (ma). Dấu thanh giúp phân biệt nghĩa, không chỉ là ngữ điệu.",
    words: [
      { hanzi: "妈", pinyin: "mā", meaning: "Mẹ" },
      { hanzi: "麻", pinyin: "má", meaning: "Gai / tê" },
      { hanzi: "马", pinyin: "mǎ", meaning: "Ngựa" },
      { hanzi: "骂", pinyin: "mà", meaning: "Mắng" },
    ],
    questions: [
      {
        type: "tone",
        prompt: "Thanh nào cao và ngang?",
        options: ["mā →", "má ↗", "mǎ ↘↗", "mà ↘"],
        answer: "mā →",
        explanation: "Thanh 1 giữ cao và ngang, ký hiệu bằng dấu ngang.",
      },
      {
        type: "tone",
        prompt: "Chọn âm mang thanh 3",
        options: ["mā", "má", "mǎ", "mà"],
        answer: "mǎ",
        explanation: "Dấu ˇ đánh dấu thanh 3.",
      },
      {
        type: "tone",
        prompt: "Âm “mà” mang thanh nào?",
        options: ["Thanh 1", "Thanh 2", "Thanh 3", "Thanh 4"],
        answer: "Thanh 4",
        explanation: "Thanh 4 đi từ cao xuống thấp, dứt khoát.",
      },
    ],
    writing:
      "Vẽ bốn đường thanh điệu → ↗ ↘↗ ↘. Viết mā, má, mǎ, mà dưới từng đường và đọc 3 lượt.",
    minutes: 10,
  },
  {
    id: "strokes",
    title: "Những nét chữ đầu tiên",
    description: "Ngang, sổ, phẩy, mác — bắt đầu thật chậm.",
    guide:
      "Các nét cơ bản gồm ngang 一, sổ 丨, phẩy 丿, mác ㇏ và chấm 丶. Quy tắc thường gặp: trên trước dưới sau, trái trước phải sau, ngang trước sổ sau. Với 一、二、三, viết các nét ngang từ trên xuống dưới. Viết vào vở giúp quan sát cấu trúc và ghi nhớ.",
    words: words.slice(6, 12),
    questions: [
      choice(words[6]),
      choice(words[7]),
      {
        type: "quiz",
        prompt: "Với 三, nên viết nét nào trước?",
        options: ["Nét trên cùng", "Nét dưới cùng", "Nét giữa", "Tùy ý"],
        answer: "Nét trên cùng",
        explanation: "Viết lần lượt ba nét ngang từ trên xuống dưới.",
      },
    ],
    writing:
      "Viết 一、二、三 mỗi chữ 5 lần trong ô vuông. Với 三: nét trên, nét giữa, rồi nét dưới. Kiểm tra độ dài và khoảng cách.",
    minutes: 12,
  },
  {
    id: "first-words",
    title: "Túi từ vựng đầu tiên",
    description: "Làm quen người, nước và trà.",
    guide:
      "Học theo nhóm nghĩa và gắn từ với vật thật: 人 (rén) là người; 水 (shuǐ) là nước; 茶 (chá) là trà. Mỗi lần học, nhìn chữ, đọc Pinyin, nói nghĩa rồi che nghĩa để tự nhớ lại.",
    words: [words[9], words[15], words[16]],
    questions: [
      choice(words[9]),
      choice(words[15]),
      choice(words[16]),
      {
        type: "match",
        prompt: "Ghép từ với nghĩa",
        options: ["人|Người", "水|Nước", "茶|Trà"],
        answer: "matched",
        explanation: "Bạn đã ghép đúng cả ba từ.",
      },
    ],
    writing:
      "Viết 人、水、茶 mỗi chữ 5 lần. Ghi Pinyin và vẽ một hình nhỏ minh họa nghĩa bên cạnh.",
    minutes: 10,
  },
  {
    id: "sentences",
    title: "Nói câu đầu tiên",
    description: "Giới thiệu bản thân với 我是…",
    guide:
      "Câu giới thiệu cơ bản: chủ ngữ + 是 + danh từ. 我是学生 = Tôi là học sinh. 你是学生吗？ = Bạn là học sinh phải không? Thêm 吗 ở cuối câu trần thuật để tạo câu hỏi có/không.",
    words: words.slice(12, 15),
    questions: [
      {
        type: "sentence",
        prompt: "Sắp xếp: “Tôi là học sinh”",
        options: ["学生", "我", "是"],
        answer: "我是学生",
        explanation: "Trật tự: chủ ngữ 我 + 是 + danh từ 学生.",
      },
      {
        type: "quiz",
        prompt: "Từ nào tạo câu hỏi có/không ở cuối câu?",
        options: ["吗", "我", "是", "你"],
        answer: "吗",
        explanation: "吗 (ma) đặt cuối câu, đọc thanh nhẹ.",
      },
      choice(words[13]),
    ],
    writing:
      "Viết 我是学生。3 lần. Tự thêm 吗 để đổi thành câu hỏi rồi đọc to.",
    minutes: 10,
  },
  {
    id: "hsk1",
    title: "HSK 1 · Bạn thích uống gì?",
    description: "Một chủ đề nhập môn: đồ uống và sở thích.",
    guide:
      "我喜欢喝茶 nghĩa là Tôi thích uống trà. 喜欢 là thích, 喝 là uống. Có thể thay 茶 bằng 水. Để phủ định, thêm 不 trước 喜欢: 我不喜欢喝茶。Đây là bài mẫu HSK 1, không phải toàn bộ giáo trình.",
    words: words.slice(15, 18),
    questions: [
      choice(words[17]),
      {
        type: "sentence",
        prompt: "Sắp xếp: “Tôi thích trà”",
        options: ["茶", "喜欢", "我"],
        answer: "我喜欢茶",
        explanation: "我 + 喜欢 + 茶: Tôi thích trà.",
      },
      choice(words[16]),
    ],
    writing:
      "Viết 我喜欢喝茶。và 我喜欢喝水。mỗi câu 3 lần. Khoanh tròn phần thay đổi.",
    minutes: 12,
  },
  {
    id: "hsk2",
    title: "HSK 2 · Việc đã làm",
    description: "Làm quen 了 trong ngữ cảnh hoàn thành.",
    guide:
      "昨天我喝了茶。= Hôm qua tôi đã uống trà. 昨天 là hôm qua. Trong ví dụ này, 了 sau động từ biểu thị hành động đã hoàn thành; không phải mọi câu quá khứ đều cần 了. Đây là bài mẫu chủ đề HSK 2.",
    words: [
      { hanzi: "昨天", pinyin: "zuótiān", meaning: "Hôm qua" },
      { hanzi: "喝", pinyin: "hē", meaning: "Uống" },
      {
        hanzi: "了",
        pinyin: "le",
        meaning: "Trợ từ (hoàn thành trong bài này)",
      },
    ],
    questions: [
      {
        type: "sentence",
        prompt: "Sắp xếp: “Hôm qua tôi đã uống trà”",
        options: ["茶", "昨天", "喝", "了", "我"],
        answer: "昨天我喝了茶",
        explanation: "昨天 + 我 + 喝了 + 茶.",
      },
      {
        type: "quiz",
        prompt: "昨天 có nghĩa là gì?",
        options: ["Hôm qua", "Hôm nay", "Ngày mai", "Tuần sau"],
        answer: "Hôm qua",
        explanation: "昨天 đọc là zuótiān.",
      },
    ],
    writing:
      "Viết 昨天我喝了茶。3 lần. Gạch chân thời gian, khoanh động từ và trợ từ 了.",
    minutes: 12,
  },
  {
    id: "hsk3",
    title: "HSK 3 · Vì sao vậy?",
    description: "Kết nối nguyên nhân và kết quả.",
    guide:
      "因为…所以… = Bởi vì… cho nên… Ví dụ: 因为下雨，所以我不去。= Vì trời mưa nên tôi không đi. 下雨 (xià yǔ): trời mưa; 去 (qù): đi. Đây là bài mẫu HSK 3; cần mở rộng vốn từ và thực hành thêm.",
    words: words.slice(18),
    questions: [
      choice(words[18]),
      choice(words[19]),
      {
        type: "sentence",
        prompt: "Sắp xếp: “Vì trời mưa nên tôi không đi”",
        options: ["我不去", "所以", "下雨", "因为"],
        answer: "因为下雨所以我不去",
        explanation:
          "因为 + nguyên nhân + 所以 + kết quả. Khi viết, thêm dấu phẩy giữa hai vế.",
      },
    ],
    writing:
      "Viết 因为下雨，所以我不去。3 lần. Đánh dấu vế nguyên nhân và vế kết quả.",
    minutes: 15,
  },
  {
    id: "review",
    title: "Đỉnh núi đầu tiên",
    description: "Ôn tập tổng hợp những gì bạn đã học.",
    guide:
      "Hãy tự nhớ lại trước khi nhìn đáp án. Đọc lời chào, phân biệt thanh điệu và ráp một câu giới thiệu bản thân. Nếu sai, xem giải thích, viết lại vào vở và thử thêm một lần.",
    words: words.slice(0, 6),
    questions: [
      ...greeting,
      {
        type: "tone",
        prompt: "Chọn âm có thanh 4",
        options: ["mā", "má", "mǎ", "mà"],
        answer: "mà",
        explanation: "Thanh 4 có dấu huyền và đi xuống dứt khoát.",
      },
    ],
    writing:
      "Che toàn bộ mẫu. Viết lại 你好、谢谢、再见 và 我是学生。Kiểm tra rồi viết lại mỗi chỗ sai 3 lần.",
    minutes: 15,
  },
];
export let stages = [
  "Làm quen với tiếng Trung",
  "Khám phá Pinyin",
  "Bốn thanh điệu",
  "Nét chữ đầu tiên",
  "Từ vựng đầu tiên",
  "Câu giao tiếp đơn giản",
  "Các chủ đề HSK 1",
  "Các chủ đề HSK 2",
  "Các chủ đề HSK 3",
  "Ôn tập tổng hợp",
];
export let allWords = [
  ...new Map(
    [...words, ...lessons.flatMap((l) => l.words)].map((w) => [w.hanzi, w]),
  ).values(),
];
export function installCurriculum(content: Lesson[]) {
  lessons = content;
  stages = content.map((l) => l.title);
  allWords = [
    ...new Map(
      content.flatMap((l) => l.words).map((w) => [w.hanzi, w]),
    ).values(),
  ];
}
