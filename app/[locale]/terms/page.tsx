import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LegalDocument, type LegalSection } from "@/components/legal/legal-document";
import { isLocale } from "@/i18n/routing";

const EMAIL = "assenheim.shahar@gmail.com";
const copy: Record<"he" | "en", { title: string; description: string; updated: string; sections: LegalSection[] }> = {
  he: {
    title: "תנאי שימוש",
    description: "תנאים אלה מסדירים את השימוש באלופות. פתיחת חשבון או שימוש בשירות מהווים הסכמה להם ולמדיניות הפרטיות.",
    updated: "גרסה: 4 בספטמבר 2026",
    sections: [
      { title: "השירות והזכאות", paragraphs: ["אלופות הוא משחק חיזוי עצמאי לאוהדי כדורגל, המופעל בידי SA Software Solutions. האתר אינו קשור, מאושר או ממומן בידי UEFA, מועדון או התאחדות כלשהם.", "השירות מיועד לבני 18 ומעלה. קטין רשאי להשתמש רק באישור הורה או אפוטרופוס ובהתאם לדין. עליכם למסור מידע נכון ולשמור על אבטחת החשבון."] },
      { title: "כללי המשחק", paragraphs: ["הניקוד, מועדי הנעילה והכרעת התוצאות מפורטים בכללי המשחק. נתוני ספק, תיקונים רשמיים ותקלות עשויים להביא לתיקון תוצאה או ניקוד. החלטות שנועדו לתקן שגיאה ברורה או שימוש לרעה יחולו באופן שוויוני."] },
      { title: "תשלומים, פרסים ואיסור הימורים", paragraphs: ["האתר אינו בית הימורים ואינו מוכר הימור. אין להשתמש בו להימור, הגרלה או משחק אסור. כל גבייה חיצונית שמנהל מנהל קבוצה היא הסדר פרטי בינו לבין חברי הקבוצה; המפעיל אינו מקבל, מחזיק, מחזיר או מבטיח את הכסף ואינו צד להסדר.", "באחריות מנהל הקבוצה והמשתתפים לוודא מראש שהסדר, דמי כניסה או פרס מותרים לפי הדין החל. כאשר קיים ספק, אין לגבות כסף או להציע פרס בעל ערך."] },
      { title: "התנהגות ותוכן משתמשים", items: ["אין להתחזות, להטריד, לאיים, לפרסם תוכן בלתי חוקי או לפגוע בפרטיות ובזכויות אחרים.", "אין להעלות תמונה או תוכן ללא הזכויות וההסכמות הנדרשות.", "אין לעקוף נעילת ניחושים, הרשאות, מגבלות קצב או אמצעי אבטחה, ואין לבצע scraping או להפריע לשירות.", "ניתן לדווח על תוכן או הפרה לכתובת הקשר. המפעיל רשאי להסיר תוכן, להגביל חשבון או לשמר ראיות כאשר הדבר נדרש."] },
      { title: "רישיון לתוכן שלכם", paragraphs: ["הזכויות בתוכן שהעליתם נשארות שלכם. אתם מעניקים למפעיל רישיון לא בלעדי, עולמי, ללא תמורה ומוגבל לתקופת האחסון, לאחסן, להציג, להתאים טכנית ולהעביר את התוכן רק לצורך הפעלת השירות ואבטחתו. הרישיון מסתיים עם מחיקת התוכן, בכפוף לגיבויים ולחובה משפטית."] },
      { title: "קניין רוחני ומקורות מידע", paragraphs: ["התוכנה, העיצוב והמותג אלופות שייכים למפעיל או לבעלי הרישיון. שמות תחרויות, מועדונים וסימנים של צדדים שלישיים שייכים לבעליהם ומשמשים לזיהוי בלבד. אין להעתיק או לנצל את השירות או את מאגריו ללא הרשאה.", "נתוני משחק עשויים להגיע מספקים חיצוניים ולהיות מאוחרים, חלקיים או שגויים. אין להסתמך עליהם לצורך החלטה כספית או מקצועית."] },
      { title: "זמינות ואחריות", paragraphs: ["השירות ניתן כפי שהוא וכפי שהוא זמין. המפעיל אינו מתחייב לרציפות, לדיוק מלא, להתאמה למטרה מסוימת או לזמינות של ספק חיצוני. במידה המרבית המותרת בדין, המפעיל לא יהיה אחראי לנזק עקיף, אובדן רווח או להסדר כספי פרטי בין משתמשים."] },
      { title: "סיום, שינוי ודין", paragraphs: ["ניתן למחוק את החשבון מהפרופיל. המפעיל רשאי להשעות שימוש שמפר תנאים אלה או מסכן את השירות. שינוי מהותי בתנאים יוצג באתר ועשוי לדרוש הסכמה מחדש.", `על התנאים יחולו דיני מדינת ישראל. אין בכך לגרוע מזכות קוגנטית של צרכן. לשאלות, דיווח או הודעת הסרה: ${EMAIL}.`] },
    ],
  },
  en: {
    title: "Terms of Use",
    description: "These terms govern Alufot. Creating an account or using the service means accepting them and the Privacy Policy.",
    updated: "Version: 4 September 2026",
    sections: [
      { title: "Service and eligibility", paragraphs: ["Alufot is an independent football prediction game operated by SA Software Solutions. It is not affiliated with, endorsed by or sponsored by UEFA, any club or football association.", "The service is intended for people aged 18 or older. A minor may use it only with a parent or guardian's consent and in compliance with law. You must provide accurate information and keep your account secure."] },
      { title: "Game rules", paragraphs: ["Scoring, lock times and result determination are described in the game rules. Provider data, official corrections and faults may require a result or score correction. Decisions made to correct a clear error or abuse will be applied consistently."] },
      { title: "Payments, prizes and no wagering", paragraphs: ["The site is not a betting operator and does not sell wagers. You must not use it for betting, a lottery or a prohibited game. Any external collection by a group manager is a private arrangement between that manager and group members; the operator does not receive, hold, refund or guarantee funds and is not a party to it.", "Managers and participants are responsible for confirming in advance that any arrangement, entry fee or prize is lawful. If there is doubt, do not collect money or offer anything of value."] },
      { title: "Conduct and user content", items: ["Do not impersonate, harass, threaten, publish unlawful content or violate another person's privacy or rights.", "Do not upload an image or content unless you hold all required rights and consents.", "Do not bypass prediction locks, permissions, rate limits or security controls, scrape data or disrupt the service.", "Report content or violations to the contact address. The operator may remove content, restrict accounts or preserve evidence when necessary."] },
      { title: "Licence to your content", paragraphs: ["You retain your rights in uploaded content. You grant the operator a non-exclusive, worldwide, royalty-free licence, limited to the storage period, to host, display, technically adapt and transmit it solely to operate and secure the service. It ends when content is deleted, subject to backups and legal duties."] },
      { title: "Intellectual property and data", paragraphs: ["The software, design and Alufot brand belong to the operator or licensors. Competition and club names and third-party marks belong to their owners and are used for identification only. You may not copy or exploit the service or its databases without permission.", "Match data may come from external providers and may be delayed, incomplete or inaccurate. Do not rely on it for financial or professional decisions."] },
      { title: "Availability and liability", paragraphs: ["The service is provided as is and as available. The operator does not promise uninterrupted operation, complete accuracy, fitness for a particular purpose or availability of an external provider. To the fullest extent permitted by law, the operator is not liable for indirect loss, lost profit or a private financial arrangement between users."] },
      { title: "Termination, changes and law", paragraphs: ["You can delete your account from your profile. The operator may suspend use that breaches these terms or threatens the service. Material changes will be posted and may require renewed acceptance.", `Israeli law governs these terms, without limiting mandatory consumer rights. For questions, reports or takedown notices: ${EMAIL}.`] },
    ],
  },
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: copy[locale].title, description: copy[locale].description } : {};
}

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <LegalDocument {...copy[locale]} />;
}