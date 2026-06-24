-- Allow anon to write to audit_logs temporarily
DROP POLICY IF EXISTS "Allow full access for authenticated users on audit_logs" ON audit_logs;
CREATE POLICY "Allow full access for authenticated users on audit_logs"
ON audit_logs FOR ALL TO public USING (true) WITH CHECK (true);
