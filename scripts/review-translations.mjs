// Curated product terminology and plural forms. Run after drafting new catalog entries.
import { readFileSync, writeFileSync } from "node:fs";
const hash = (s) => { let n = 2166136261; for (let i = 0; i < s.length; i++) n = Math.imul(n ^ s.charCodeAt(i), 16777619); return `m${(n >>> 0).toString(36)}`; };
const messages = [
  ["Language", "Langue", "Idioma", "اللغة"],
  ["Changing language…", "Changement de langue…", "Cambiando idioma…", "جارٍ تغيير اللغة…"],
  ["Upload résumé", "Importer un CV", "Subir currículum", "رفع السيرة الذاتية"],
  ["Résumé text", "Texte du CV", "Texto del currículum", "نص السيرة الذاتية"],
  ["Paste your résumé text", "Collez le texte de votre CV", "Pega el texto de tu currículum", "الصق نص سيرتك الذاتية"],
  ["Your next job isn’t a guessing game.", "Votre prochain emploi ne se joue pas au hasard.", "Tu próximo empleo no es un juego de adivinanzas.", "وظيفتك القادمة لا تعتمد على التخمين."],
  ["Your AI career partner", "Votre partenaire carrière IA", "Tu compañero profesional con IA", "شريكك المهني بالذكاء الاصطناعي"],
  ["My roadmap", "Ma feuille de route", "Mi plan de acción", "خطتي المهنية"],
  ["Roadmap", "Feuille de route", "Plan de acción", "الخطة المهنية"],
  ["Owner access", "Accès propriétaire", "Acceso del propietario", "صلاحيات المالك"],
  ["History", "Historique", "Historial", "السجل"],
  ["Main navigation", "Navigation principale", "Navegación principal", "التنقل الرئيسي"],
  ["Request a company", "Demander l’ajout d’une entreprise", "Solicitar una empresa", "طلب إضافة شركة"],
  ["Contact", "Contact", "Contacto", "تواصل معنا"],
  ["Carreadi — career readiness", "Carreadi — préparation professionnelle", "Carreadi — preparación profesional", "Carreadi — الاستعداد المهني"],
  ["a specific language", "une langue précise", "un idioma específico", "لغة محددة"],
  ["a security clearance", "une habilitation de sécurité", "una autorización de seguridad", "تصريح أمني"],
  ["existing work authorization", "une autorisation de travail existante", "una autorización de trabajo vigente", "تصريح عمل ساري المفعول"],
  ["living in a specific place", "de résider dans un lieu précis", "residir en un lugar específico", "الإقامة في مكان محدد"],
  ["Posting lists few skills we can check — read it directly", "L’offre mentionne peu de compétences vérifiables : lisez-la directement", "La oferta enumera pocas habilidades que podamos comprobar; léela directamente", "يذكر الإعلان مهارات قليلة يمكننا التحقق منها؛ اقرأه مباشرة"],
  ["Work style not stated in the posting", "Mode de travail non précisé dans l’offre", "La oferta no indica la modalidad de trabajo", "لم يُذكر نمط العمل في الإعلان"],
  ["Sign in", "Se connecter", "Iniciar sesión", "تسجيل الدخول"],
  ["Keep your checks safe", "Gardez vos analyses en sécurité", "Mantén tus análisis a salvo", "احفظ تحليلاتك بأمان"],
  ["Sign in to save your checks and roadmap to your Carreadi account, so they’re there on any device, even after your pass ends. Your CV is never saved.", "Connectez-vous pour enregistrer vos analyses et votre feuille de route dans votre compte Carreadi. Vous les retrouverez sur tout appareil, même après l’expiration de votre pass. Votre CV n’est jamais enregistré.", "Inicia sesión para guardar tus análisis y tu plan en tu cuenta de Carreadi y acceder a ellos desde cualquier dispositivo, incluso después de que caduque tu pase. Tu currículum nunca se guarda.", "سجّل الدخول لحفظ تحليلاتك وخطتك المهنية في حسابك على Carreadi، لتتمكن من الوصول إليها من أي جهاز حتى بعد انتهاء تصريحك. لا تُحفظ سيرتك الذاتية مطلقًا."],
  ["Use any email you like. It will be linked to the pass on this device.", "Utilisez l’adresse e-mail de votre choix. Elle sera liée au pass sur cet appareil.", "Usa el correo que prefieras. Se vinculará al pase de este dispositivo.", "استخدم البريد الإلكتروني الذي تفضّله. سيتم ربطه بالتصريح على هذا الجهاز."],
  ["Passes are one-time purchases, not subscriptions. You are never charged again automatically.", "Les pass sont des achats uniques, pas des abonnements. Aucun nouveau paiement n’est prélevé automatiquement.", "Los pases son compras únicas, no suscripciones. Nunca se te vuelve a cobrar automáticamente.", "التصاريح مشتريات لمرة واحدة وليست اشتراكات. لا يتم تحصيل أي دفعة جديدة منك تلقائيًا."],
  ["Sign in to Carreadi", "Se connecter à Carreadi", "Inicia sesión en Carreadi", "تسجيل الدخول إلى Carreadi"],
  ["The link works once and expires in {minutes} minutes.", "Ce lien est à usage unique et expire dans {minutes} minutes.", "El enlace solo se puede usar una vez y caduca en {minutes} minutos.", "يمكن استخدام الرابط مرة واحدة، وتنتهي صلاحيته خلال {minutes} دقيقة."],
  ["Active pass: {plan} · Days left: {days} · Analyses left: {analyses}", "Pass actif : {plan} · Jours restants : {days} · Analyses restantes : {analyses}", "Pase activo: {plan} · Días restantes: {days} · Análisis restantes: {analyses}", "التصريح النشط: {plan} · الأيام المتبقية: {days} · التحليلات المتبقية: {analyses}"],
  ["Days left: {days} · Full analyses: {analyses}", "Jours restants : {days} · Analyses complètes : {analyses}", "Días restantes: {days} · Análisis completos: {analyses}", "الأيام المتبقية: {days} · التحليلات الكاملة: {analyses}"],
  ["Showing your top {shown} matches. {count, plural, one {# more ranked match unlocks with a pass.} other {# more ranked matches unlock with a pass.}}", "Vos {shown} meilleures correspondances. {count, plural, one {# correspondance supplémentaire à débloquer avec un pass.} other {# correspondances supplémentaires à débloquer avec un pass.}}", "Tus {shown} mejores coincidencias. {count, plural, one {# coincidencia adicional se desbloquea con un pase.} other {# coincidencias adicionales se desbloquean con un pase.}}", "أفضل {shown} نتائج مطابقة لك. {count, plural, zero {لا توجد نتائج إضافية.} one {يمكن فتح نتيجة إضافية واحدة بتصريح.} two {يمكن فتح نتيجتين إضافيتين بتصريح.} few {يمكن فتح # نتائج إضافية بتصريح.} many {يمكن فتح # نتيجة إضافية بتصريح.} other {يمكن فتح # نتيجة إضافية بتصريح.}}"],
  ["Your full roadmap and {count, plural, one {# more gap are locked.} other {# more gaps are locked.}}", "Votre feuille de route complète et {count, plural, one {# lacune supplémentaire sont verrouillées.} other {# lacunes supplémentaires sont verrouillées.}}", "Tu plan completo y {count, plural, one {# carencia adicional están bloqueados.} other {# carencias adicionales están bloqueados.}}", "خطتك الكاملة مقفلة، وكذلك {count, plural, zero {الفجوات الإضافية.} one {فجوة إضافية واحدة.} two {فجوتان إضافيتان.} few {# فجوات إضافية.} many {# فجوة إضافية.} other {# فجوة إضافية.}}"],
  ["Your full roadmap is locked.", "Votre feuille de route complète est verrouillée.", "Tu plan completo está bloqueado.", "خطتك المهنية الكاملة مقفلة."],
  ["Company sources: {companies}. Additional sources: {extras}.", "Sources d’entreprises : {companies}. Autres sources : {extras}.", "Fuentes de empresas: {companies}. Fuentes adicionales: {extras}.", "مصادر الشركات: {companies}. المصادر الإضافية: {extras}."],
  ["Day pass", "Pass journée", "Pase de un día", "تصريح ليوم واحد"],
  ["Week pass", "Pass semaine", "Pase de una semana", "تصريح لأسبوع"],
];
for (const [index, locale] of ["en", "fr", "es", "ar"].entries()) {
  const path = `messages/${locale}.json`, catalog = JSON.parse(readFileSync(path, "utf8"));
  for (const entry of messages) catalog.ui[hash(entry[0])] = entry[index];
  if (locale === "fr") for (const [key, value] of Object.entries(catalog.ui)) catalog.ui[key] = value.replace(/votre résumé/gi, "votre CV").replace(/le résumé/gi, "le CV");
  if (locale === "ar") {
    const source = JSON.parse(readFileSync("messages/en.json", "utf8")).ui;
    for (const [key, value] of Object.entries(catalog.ui)) {
      let text = value.replace(/فحوصات/g, "تحليلات");
      if (/\bpasses?\b/i.test(source[key] ?? "") && !/\bsubscriptions?\b/i.test(source[key] ?? "")) text = text.replace(/اشتراكات/g, "تصاريح").replace(/اشتراك/g, "تصريح");
      catalog.ui[key] = text;
    }
  }
  writeFileSync(path, JSON.stringify(catalog, null, 2) + "\n");
}
console.log("Product terminology and plural forms updated.");
