import { Layout } from "@/components/Layout";

export default function Terms() {
  return (
    <Layout>
      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">Terms of Service</h1>
          <p className="text-sm text-muted-foreground mb-12">Last updated: March 15, 2026</p>

          <div className="space-y-10 text-foreground">

            <section>
              <h2 className="text-xl font-semibold mb-3">1. Acceptance of Terms</h2>
              <p className="text-muted-foreground leading-relaxed">
                By accessing or using Werkpages (the "Service"), you agree to be bound by these
                Terms of Service ("Terms"). If you do not agree to these Terms, please do not use the Service.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-3">
                We reserve the right to update these Terms at any time, and continued use of the Service
                constitutes acceptance of any changes.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">2. Eligibility</h2>
              <p className="text-muted-foreground leading-relaxed">
                You must be at least 18 years of age to use the Service. By using the Service, you
                represent and warrant that you meet this requirement and that you have the legal capacity
                to enter into these Terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">3. Nature of Ratings</h2>
              <p className="text-muted-foreground leading-relaxed">
                All ratings submitted on Werkpages are star-based scores reflecting individual
                perceptions of workplace interactions and working relationships.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-3">
                Ratings do not constitute statements of fact and should not be interpreted as factual
                claims about any individual. They represent the subjective experience and opinion of the
                reviewer at the time of submission.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-3">
                Werkpages does not make any representations or assertions about the character,
                competence, or conduct of any individual.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-3">
                Werkpages does not verify the accuracy of any rating or the employment relationship
                between a reviewer and a manager.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">4. User Accounts</h2>
              <p className="text-muted-foreground leading-relaxed">
                You are responsible for maintaining the confidentiality of your account credentials
                and for all activity that occurs under your account.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-3">
                You agree to provide accurate information when registering and to notify us immediately
                of any unauthorized use of your account.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">5. Acceptable Use</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">When using the Service, you agree not to:</p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                <li>Submit reviews for managers you have not personally worked with.</li>
                <li>Create duplicate accounts or submit multiple reviews for the same manager.</li>
                <li>Use the Service to harass, intimidate, or target any individual.</li>
                <li>Submit false, misleading, or fabricated information.</li>
                <li>Attempt to manipulate ratings through coordinated or artificial means.</li>
                <li>Use the Service for any unlawful purpose or in violation of any applicable law.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">6. Content and Manager Profiles</h2>
              <p className="text-muted-foreground leading-relaxed">
                Users may submit manager profiles containing publicly available professional information.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-3">
                By submitting a profile or review, you grant Werkpages a non-exclusive, royalty-free
                licence to display that content on the Service.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-3">
                You represent that you have the right to submit such content and that it does not violate
                any third-party rights or applicable laws.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-3">
                Werkpages reserves the right to remove any content at its sole discretion.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">7. Reporting and Moderation</h2>
              <p className="text-muted-foreground leading-relaxed">
                We provide a reporting mechanism for users to flag inaccurate or inappropriate profiles.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-3">
                We review all reports and make reasonable efforts to address legitimate concerns, including
                correcting factual inaccuracies or removing content that violates these Terms.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-3">
                Individuals who believe they have been inaccurately represented may contact us to request
                a review of the profile or associated ratings. We will assess such requests in accordance
                with our moderation policies.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">8. Disclaimer of Warranties</h2>
              <p className="text-muted-foreground leading-relaxed">
                The Service is provided "as is" and "as available" without warranties of any kind,
                express or implied.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-3">
                Werkpages does not warrant that the Service will be uninterrupted, error-free,
                or free of harmful components.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-3">
                We do not endorse or verify any ratings, reviews, or manager profiles submitted by users.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">9. Limitation of Liability</h2>
              <p className="text-muted-foreground leading-relaxed">
                To the fullest extent permitted by applicable law, Werkpages shall not be liable
                for any indirect, incidental, special, consequential, or punitive damages arising from
                your use of or inability to use the Service, or from any content submitted by users.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-3">
                Our total liability for any claim arising out of or relating to these Terms or the
                Service shall not exceed the amount you paid us, if any, in the twelve months preceding
                the claim.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">10. Account Termination</h2>
              <p className="text-muted-foreground leading-relaxed">
                You may delete your account at any time through your account settings.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-3">
                We reserve the right to suspend or terminate your account at our sole discretion if we
                believe you have violated these Terms, without notice or liability to you.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">11. Governing Law</h2>
              <p className="text-muted-foreground leading-relaxed">
                These Terms are governed by and construed in accordance with the laws of Canada and the
                province of Ontario, without regard to conflict of law principles.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-3">
                Any disputes arising under these Terms shall be subject to the exclusive jurisdiction
                of the courts of Ontario.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">13. Indemnification</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                You agree to indemnify, defend, and hold harmless Werkpages, its affiliates, and its operators
                from and against any claims, liabilities, damages, losses, and expenses (including legal fees) arising
                out of or related to:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-3">
                <li>Your use of the Service;</li>
                <li>Any content you submit, including ratings or manager profiles;</li>
                <li>Your violation of these Terms; or</li>
                <li>Your violation of any applicable law or the rights of any third party.</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed">
                We reserve the right to assume the exclusive defence and control of any matter subject to indemnification
                by you, in which case you agree to cooperate with us in asserting any available defences.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">12. Contact Us</h2>
              <p className="text-muted-foreground leading-relaxed">
                If you have any questions about these Terms, please contact us at{" "}
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
