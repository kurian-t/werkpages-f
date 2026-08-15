-- Cleans manager titles to only recognized canonical title phrases.
-- Longer/more-specific patterns must come before shorter ones in the alternation
-- so "President and CEO" matches before bare "President".

DO $$
DECLARE
  pat TEXT :=
    '(Executive Vice President(?:\s+(?:and|&)\s+\w+(?:\s+\w+)*)?'
    '|Senior Vice President(?:\s+(?:and|&)\s+\w+(?:\s+\w+)*)?'
    '|Vice President'
    '|Chief Executive Officer'
    '|Chief Financial Officer'
    '|Chief Operating Officer'
    '|Chief Technology Officer'
    '|Chief Information Officer'
    '|Chief Marketing Officer'
    '|Chief Legal Officer'
    '|Chief Revenue Officer'
    '|Chief Risk Officer'
    '|Chief Human Resources Officer'
    '|Chief People Officer'
    '|Chief Data Officer'
    '|Chief Commercial Officer'
    '|Chief Administrative Officer'
    '|Chief Strategy Officer'
    '|Chief Scientific Officer'
    '|Chief Medical Officer'
    '|Chief Compliance Officer'
    '|Chief Accounting Officer'
    '|Chief Digital Officer'
    '|Chief Sustainability Officer'
    '|Chief Security Officer'
    '|Chief Product Officer'
    '|Chief Supply Chain Officer'
    '|Chief Transformation Officer'
    '|Chief Analytics Officer'
    '|Chief Business Officer'
    '|Chief Experience Officer'
    '|Chief Growth Officer'
    '|Chief Innovation Officer'
    '|Chief Investment Officer'
    '|Chief Procurement Officer'
    '|Chief Sales Officer'
    '|Chief Tax Officer'
    '|Chief Treasury Officer'
    '|President\s+(?:and|&)\s+(?:Chief Executive Officer|CEO)'
    '|President'
    '|CEO|CFO|COO|CTO|CIO|CMO|CLO|CHRO|CPO|CDO|CRO|CCO|CSO|CAO|CBO|CXO'
    '|Chairman of the Board'
    '|Chairman'
    '|Chairwoman'
    '|Chair'
    '|Managing Director'
    '|Executive Director'
    '|Independent Director'
    '|Director'
    '|General Counsel'
    '|Treasurer'
    '|Secretary)';
BEGIN
  -- Preview (comment out after reviewing)
  RAISE NOTICE 'Rows to update: %', (
    SELECT COUNT(*) FROM managers
    WHERE (regexp_match(title, pat, 'i'))[1] IS NOT NULL
      AND title IS DISTINCT FROM (regexp_match(title, pat, 'i'))[1]
  );

  UPDATE managers
  SET title = (regexp_match(title, pat, 'i'))[1]
  WHERE (regexp_match(title, pat, 'i'))[1] IS NOT NULL
    AND title IS DISTINCT FROM (regexp_match(title, pat, 'i'))[1];

  RAISE NOTICE 'Done. Rows updated: %', (
    SELECT COUNT(*) FROM managers
    WHERE title IN (
      'CEO','CFO','COO','CTO','CIO','CMO','President','Chair','Chairman',
      'Chairwoman','Director','General Counsel','Treasurer','Secretary'
    )
  );
END $$;
