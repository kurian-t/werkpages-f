import { Layout } from "@/components/Layout";

export default function Privacy() {
  return (
    <Layout>
      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground mb-12">Last updated: March 15, 2026</p>

          <div className="space-y-10 text-foreground">

            <section>
              <h2 className="text-xl font-semibold mb-3">1. Introduction</h2>
              <p className="text-muted-foreground leading-relaxed">
                Werkpages ("we", "us", or "our") is committed to protecting your personal information
                and your right to privacy. This Privacy Policy explains how we collect, use, and safeguard
                your information when you use our platform (the "Service"). We operate in accordance with
                Canada's Personal Information Protection and Electronic Documents Act (PIPEDA).
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">2. Information We Collect</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">We collect the following types of information:</p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                <li><span className="font-medium text-foreground">Account information:</span> your name, email address, and username when you register.</li>
                <li><span className="font-medium text-foreground">Review data:</span> star ratings and perceived workplace interaction scores you submit.</li>
                <li><span className="font-medium text-foreground">Manager profile data:</span> names, job titles, company affiliations, and LinkedIn URLs submitted by users.</li>
                <li><span className="font-medium text-foreground">Usage data:</span> standard server logs including IP address, browser type, and pages visited.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">3. How We Use Your Information</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">We use the information we collect to:</p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                <li>Provide, operate, and maintain the Service.</li>
                <li>Associate reviews with your account to prevent duplicate submissions.</li>
                <li>Respond to reports of inaccurate or inappropriate content.</li>
                <li>Improve the Service and understand how it is used.</li>
                <li>Communicate with you regarding your account or the Service.</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-3">
                We do not sell your personal information to third parties.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">4. Ratings and Reviews</h2>
              <p className="text-muted-foreground leading-relaxed">
                All ratings on Werkpages are star-based scores reflecting individual perceptions
                of workplace interactions. They do not constitute statements of fact.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-3">
                Ratings are displayed in aggregate form and may be based on a limited number of submissions.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-3">
                You may edit or delete your own reviews at any time from your account settings.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">5. Manager Profiles</h2>
              <p className="text-muted-foreground leading-relaxed">
                Manager profiles are created by users and may include publicly available professional
                information such as name, job title, company, and LinkedIn URL. If you believe your 
                profile contains factually incorrect information (such as an incorrect name, company, 
                or title), or if you have been incorrectly identified, please contact us and we will 
                investigate and correct the record. Ratings represent the subjective perceptions of 
                reviewers and are not subject to removal solely on the basis that they are unfavorable.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">6. Data Retention</h2>
              <p className="text-muted-foreground leading-relaxed">
                We retain your account information and associated reviews for as long as your account
                is active. If you delete your account, your personal account data is removed from our
                systems. Reviews are already pseudonymous and contain no personal account data, so they
                are retained rather than deleted so that aggregate rating data remains accurate.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">7. Data Security</h2>
              <p className="text-muted-foreground leading-relaxed">
                We implement appropriate technical and organizational measures to protect your personal
                information against unauthorized access, alteration, disclosure, or destruction.
                Authentication is handled via Auth0 and all data is transmitted over HTTPS. No method
                of transmission over the internet is 100% secure, however.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">8. Your Rights Under PIPEDA</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">Under PIPEDA, you have the right to:</p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                <li>Access the personal information we hold about you.</li>
                <li>Request correction of inaccurate information.</li>
                <li>Withdraw consent to the collection or use of your information, subject to legal or contractual restrictions.</li>
                <li>File a complaint with the Office of the Privacy Commissioner of Canada.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">9. Third-Party Services</h2>
              <p className="text-muted-foreground leading-relaxed">
                We use Auth0 for authentication. Their privacy practices are governed by their own
                privacy policy available at auth0.com. We do not use third-party advertising networks
                or sell your data to any third parties.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">10. Changes to This Policy</h2>
              <p className="text-muted-foreground leading-relaxed">
                We may update this Privacy Policy from time to time. We will notify you of any material
                changes by updating the date at the top of this page. Continued use of the Service after
                changes constitutes acceptance of the updated policy.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">11. Contact Us</h2>
              <p className="text-muted-foreground leading-relaxed">
                If you have any questions about this Privacy Policy or wish to exercise your rights,
                please contact us at{" "}
                <a href="mailto:contact@werkpages.com" className="text-primary hover:underline">
                  contact@werkpages.com
                </a>.
              </p>
            </section>

          </div>
        </div>
      </section>
    </Layout>
  );
}
