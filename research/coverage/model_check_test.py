import unittest
import numpy as np
from research.coverage.model_check import fit_fold

class FoldTests(unittest.TestCase):
    def setUp(self):
        self.seeds=np.repeat(['a','b','c'],4)
        self.x=np.arange(24,dtype=float).reshape(12,2)
        self.y=np.tile([0,1,0,1],3)

    def test_held_week_labels_cannot_change_fit_or_prediction(self):
        first=fit_fold(self.x,self.y,self.seeds,'c')
        altered=self.y.copy();altered[self.seeds=='c']=1-altered[self.seeds=='c']
        second=fit_fold(self.x,altered,self.seeds,'c')
        self.assertEqual(first[3],second[3])
        np.testing.assert_array_equal(first[1],second[1])
        np.testing.assert_array_equal(first[2],second[2])
        self.assertEqual(first[3]['trainSeeds'],['a','b'])

    def test_held_week_features_cannot_change_scaling_or_coefficients(self):
        first=fit_fold(self.x,self.y,self.seeds,'c')
        altered=self.x.copy();altered[self.seeds=='c']*=10000
        second=fit_fold(altered,self.y,self.seeds,'c')
        self.assertEqual(first[3],second[3])
        self.assertEqual(int(sum(first[0])),4)

if __name__=='__main__':unittest.main()
