import importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('incorporated',Path(__file__).resolve().parents[1]/'scripts/extract-incorporated-code.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class IncorporatedTitleGuards(unittest.TestCase):
 def test_bold_title_requires_exact_body_prefix(self):
  self.assertEqual(m.verified_code_title('101','Title\n1. Text.',{'101':'Title'},{},92),'Title')
  with self.assertRaisesRegex(ValueError,'Unverified bold'):m.verified_code_title('101','Different\n1. Text.',{'101':'Title'},{},92)
 def test_missing_bold_title_has_no_automatic_first_line_fallback(self):
  with self.assertRaisesRegex(ValueError,'Unverified bold'):m.verified_code_title('179','Title\nBody',{}, {},156)
 def test_reviewed_regular_weight_title_preserves_both_lines(self):
  title='Αποβολή εγκατεστημένων\nστα απαλλοτριούμενα ακίνητα';profile={'reviewed_titles':{'179':{'title':title,'source_page':156}}}
  self.assertEqual(m.verified_code_title('179',title+'\n1. Body',{},profile,156),title)
 def test_reviewed_title_rejects_page_or_native_text_drift(self):
  profile={'reviewed_titles':{'179':{'title':'Line one\nLine two','source_page':156}}}
  for body,page in [('Line one\nDifferent\n1. Body',156),('Line one\nLine two\n1. Body',155)]:
   with self.subTest(body=body,page=page),self.assertRaisesRegex(ValueError,'Reviewed Code title or page changed'):m.verified_code_title('179',body,{},profile,page)
if __name__=='__main__':unittest.main()
