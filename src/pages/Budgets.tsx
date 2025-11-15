import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Plus, 
  Edit, 
  Trash2, 
  Target,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  X,
  Users,
  Mail,
  Phone,
  UserPlus
} from 'lucide-react'
import { useAppSelector, useAppDispatch } from '../redux/hooks'
import { fetchBudgets, addBudget, updateBudget, deleteBudget, clearError } from '../redux/slices/budgetSlice'
import { fetchCategories } from '../redux/slices/categorySlice'
import { fetchExpenses, updateExpense } from '../redux/slices/expenseSlice'
import { formatCurrency, getMonthExpenses, getExpensesByCategory, sortCategoriesById } from '../utils/helpers'

interface BudgetFormData {
  categoryId: string
  limitAmount: number | null
  month: string
  isShared?: boolean
  groupName?: string
  memberIds?: number[]
}

interface MemberInput {
  emailOrPhone: string
  id?: number
  name?: string
}

const Budgets = () => {
  const dispatch = useAppDispatch()
  const { budgets, loading, error } = useAppSelector((state) => state.budgets)
  const { categories } = useAppSelector((state) => state.categories)
  const { expenses } = useAppSelector((state) => state.expenses)
  const { user } = useAppSelector((state) => state.auth)
  
  const [activeTab, setActiveTab] = useState<'my' | 'shared'>('my')
  const [showForm, setShowForm] = useState(false)
  const [showSharedForm, setShowSharedForm] = useState(false)
  const [editingBudget, setEditingBudget] = useState<any>(null)
  const [formData, setFormData] = useState<BudgetFormData>({
    categoryId: '',
    limitAmount: null,
    month: new Date().toISOString().slice(0, 7)
  })
  const [sharedFormData, setSharedFormData] = useState<BudgetFormData>({
    categoryId: '',
    limitAmount: null,
    month: new Date().toISOString().slice(0, 7),
    isShared: true,
    groupName: '',
    memberIds: []
  })
  const [memberInputs, setMemberInputs] = useState<MemberInput[]>([])
  const [showUnlinkedExpensesPrompt, setShowUnlinkedExpensesPrompt] = useState(false)
  const [unlinkedExpenses, setUnlinkedExpenses] = useState<any[]>([])
  const [newBudgetId, setNewBudgetId] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<Map<number, any[]>>(new Map())
  const [showSuggestions, setShowSuggestions] = useState<Map<number, boolean>>(new Map())
  const [memberErrors, setMemberErrors] = useState<Map<number, string>>(new Map())
  const [paymentStatuses, setPaymentStatuses] = useState<Map<string, boolean>>(new Map())
  const [markingPaid, setMarkingPaid] = useState<Map<string, boolean>>(new Map())

  useEffect(() => {
    dispatch(fetchBudgets())
    dispatch(fetchCategories())
    dispatch(fetchExpenses())
  }, [dispatch])
  
  // Fetch payment statuses for shared budgets
  useEffect(() => {
    const fetchPaymentStatuses = async () => {
      if (!user?.id) return
      const sharedBudgetsList = budgets.filter(b => b.isShared)
      const token = localStorage.getItem('token')
      if (!token) return
      
      const statusMap = new Map<string, boolean>()
      for (const budget of sharedBudgetsList) {
        try {
          const response = await fetch(`/api/user/budgets/${budget.id}/payment-status`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'X-User-Id': user.id,
            },
          })
          if (response.ok) {
            const data = await response.json()
            statusMap.set(budget.id, data.isPaid || false)
          }
        } catch (error) {
          console.error('Error fetching payment status:', error)
        }
      }
      setPaymentStatuses(statusMap)
    }
    
    if (budgets.length > 0 && user?.id) {
      fetchPaymentStatuses()
    }
  }, [budgets, user?.id])
  
  const handleMarkAsPaid = async (budgetId: string) => {
    if (!user?.id) return
    const token = localStorage.getItem('token')
    if (!token) return
    
    const newMarkingPaid = new Map(markingPaid)
    newMarkingPaid.set(budgetId, true)
    setMarkingPaid(newMarkingPaid)
    
    try {
      const response = await fetch(`/api/user/budgets/${budgetId}/mark-paid`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-User-Id': user.id,
          'Content-Type': 'application/json',
        },
      })
      if (response.ok) {
        const newStatuses = new Map(paymentStatuses)
        newStatuses.set(budgetId, true)
        setPaymentStatuses(newStatuses)
        dispatch(fetchBudgets()) // Refresh budgets
      } else {
        const error = await response.json()
        alert(`Failed to mark as paid: ${error.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error marking budget as paid:', error)
      alert('Failed to mark as paid. Please try again.')
    } finally {
      const newMarkingPaid = new Map(markingPaid)
      newMarkingPaid.set(budgetId, false)
      setMarkingPaid(newMarkingPaid)
    }
  }

  // Filter budgets by type
  const myBudgets = budgets.filter(b => !b.isShared)
  const sharedBudgets = budgets.filter(b => b.isShared)

  // Calculate spent amounts for each budget
  const calculateBudgetSpent = (budget: any) => {
    const [year, month] = budget.month.split('-').map(Number)
    const currentMonthExpenses = getMonthExpenses(expenses, new Date(year, month - 1))
    
    if (budget.isShared) {
      // For shared budgets, sum all expenses from all members in that category
      return currentMonthExpenses
        .filter(exp => exp.category === budget.categoryName)
        .reduce((sum, exp) => sum + exp.amount, 0)
    } else {
      const expensesByCategory = getExpensesByCategory(currentMonthExpenses)
      return expensesByCategory[budget.categoryName] || 0
    }
  }

  const budgetsWithSpent = budgets.map(budget => {
    const spent = calculateBudgetSpent(budget)
    const percentage = (spent / budget.limitAmount) * 100
    
    return {
      ...budget,
      spent,
      percentage,
      status: percentage >= 100 ? 'exceeded' : percentage >= 80 ? 'warning' : 'good'
    }
  })

  const myBudgetsWithSpent = budgetsWithSpent.filter(b => !b.isShared)
  const sharedBudgetsWithSpent = budgetsWithSpent.filter(b => b.isShared)

  const totalBudget = budgetsWithSpent.reduce((sum, budget) => sum + budget.limitAmount, 0)
  const totalSpent = budgetsWithSpent.reduce((sum, budget) => sum + budget.spent, 0)
  const totalRemaining = totalBudget - totalSpent

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (editingBudget) {
      await dispatch(updateBudget({ ...editingBudget, ...formData }))
      setEditingBudget(null)
    } else {
      const result = await dispatch(addBudget({
        categoryId: parseInt(formData.categoryId),
        limitAmount: formData.limitAmount || 0,
        month: formData.month
      }))
      
      // Check for unlinked expenses after creating budget
      if (addBudget.fulfilled.match(result)) {
        const budgetId = result.payload.id
        const categoryId = parseInt(formData.categoryId)
        const month = formData.month
        
        // Find unlinked expenses for this category and month
        const [year, monthNum] = month.split('-').map(Number)
        const monthExpenses = getMonthExpenses(expenses, new Date(year, monthNum - 1))
        const categoryName = categories.find(c => c.id === categoryId.toString())?.name
        const unlinked = monthExpenses.filter(exp => 
          exp.category === categoryName && 
          !exp.budgetId // Expenses without budgetId are unlinked
        )
        
        if (unlinked.length > 0) {
          setUnlinkedExpenses(unlinked)
          setNewBudgetId(budgetId)
          setShowUnlinkedExpensesPrompt(true)
        }
      }
    }
    
    setFormData({
      categoryId: '',
      limitAmount: null,
      month: new Date().toISOString().slice(0, 7)
    })
    setShowForm(false)
  }

  const handleSharedSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate all member inputs
    const newErrors = new Map<number, string>()
    const memberIds: number[] = []
    
    for (let i = 0; i < memberInputs.length; i++) {
      const memberInput = memberInputs[i]
      if (!memberInput.emailOrPhone.trim()) {
        continue // Skip empty inputs
      }
      
      if (memberInput.id) {
        memberIds.push(memberInput.id)
      } else {
        // Try to find user by email/phone
        try {
          const token = localStorage.getItem('token')
          const response = await fetch(`/api/user/search?${memberInput.emailOrPhone.includes('@') ? `email=${encodeURIComponent(memberInput.emailOrPhone.trim())}` : `phone=${encodeURIComponent(memberInput.emailOrPhone.trim())}`}`, {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          })
          if (response.ok) {
            const data = await response.json()
            if (data.found && data.id) {
              memberIds.push(data.id)
            } else {
              newErrors.set(i, `User not found: ${memberInput.emailOrPhone}. Please check the email or phone number.`)
            }
          }
        } catch (error) {
          console.error('Error searching for user:', error)
          newErrors.set(i, `Error searching for user: ${memberInput.emailOrPhone}`)
        }
      }
    }
    
    // If there are errors, show them and don't submit
    if (newErrors.size > 0) {
      setMemberErrors(newErrors)
      return
    }
    
    const result = await dispatch(addBudget({
      categoryId: parseInt(sharedFormData.categoryId),
      limitAmount: sharedFormData.limitAmount || 0,
      month: sharedFormData.month,
      isShared: true,
      groupName: sharedFormData.groupName,
      memberIds
    }))
    
    if (addBudget.fulfilled.match(result)) {
      setSharedFormData({
        categoryId: '',
        limitAmount: null,
        month: new Date().toISOString().slice(0, 7),
        isShared: true,
        groupName: '',
        memberIds: []
      })
      setMemberInputs([])
      setSuggestions(new Map())
      setShowSuggestions(new Map())
      setMemberErrors(new Map())
      setShowSharedForm(false)
    }
  }

  const handleLinkExpenses = async () => {
    if (!newBudgetId) return
    
    const token = localStorage.getItem('token')
    if (!token || !user?.id) return
    
    // Link each unlinked expense to the new budget
    for (const expense of unlinkedExpenses) {
      try {
        const category = categories.find(c => c.name === expense.category)
        if (!category) continue
        
        await dispatch(updateExpense({
          ...expense,
          budgetId: newBudgetId
        }))
      } catch (error) {
        console.error('Error linking expense:', error)
      }
    }
    
    setShowUnlinkedExpensesPrompt(false)
    setUnlinkedExpenses([])
    setNewBudgetId(null)
    dispatch(fetchExpenses())
    dispatch(fetchBudgets()) // Refresh budgets to show updated spent amounts
  }

  const handleEdit = (budget: any) => {
    setEditingBudget(budget)
    setFormData({
      categoryId: budget.categoryId?.toString() || budget.category,
      limitAmount: budget.limitAmount || budget.amount || null,
      month: budget.month
    })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this budget?')) {
      await dispatch(deleteBudget(id))
    }
  }

  const addMemberInput = () => {
    setMemberInputs([...memberInputs, { emailOrPhone: '' }])
  }

  const removeMemberInput = (index: number) => {
    setMemberInputs(memberInputs.filter((_, i) => i !== index))
  }

  const updateMemberInput = async (index: number, value: string) => {
    const updated = [...memberInputs]
    updated[index].emailOrPhone = value
    updated[index].id = undefined
    updated[index].name = undefined
    setMemberInputs(updated)
    
    // Clear previous error
    const newErrors = new Map(memberErrors)
    newErrors.delete(index)
    setMemberErrors(newErrors)
    
    // Search for suggestions if user has typed at least 2 characters
    if (value.trim().length >= 2) {
      try {
        const token = localStorage.getItem('token')
        const response = await fetch(`/api/user/search?q=${encodeURIComponent(value.trim())}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        })
        if (response.ok) {
          const data = await response.json()
          const newSuggestions = new Map(suggestions)
          newSuggestions.set(index, data.suggestions || [])
          setSuggestions(newSuggestions)
          
          const newShowSuggestions = new Map(showSuggestions)
          newShowSuggestions.set(index, true)
          setShowSuggestions(newShowSuggestions)
        }
      } catch (error) {
        console.error('Error searching for users:', error)
      }
    } else {
      const newSuggestions = new Map(suggestions)
      newSuggestions.delete(index)
      setSuggestions(newSuggestions)
      
      const newShowSuggestions = new Map(showSuggestions)
      newShowSuggestions.set(index, false)
      setShowSuggestions(newShowSuggestions)
    }
  }
  
  const selectSuggestion = (index: number, user: any) => {
    const updated = [...memberInputs]
    updated[index].emailOrPhone = user.email || user.phoneNumber
    updated[index].id = user.id
    updated[index].name = user.name
    setMemberInputs(updated)
    
    const newSuggestions = new Map(suggestions)
    newSuggestions.delete(index)
    setSuggestions(newSuggestions)
    
    const newShowSuggestions = new Map(showSuggestions)
    newShowSuggestions.set(index, false)
    setShowSuggestions(newShowSuggestions)
    
    // Clear error
    const newErrors = new Map(memberErrors)
    newErrors.delete(index)
    setMemberErrors(newErrors)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'exceeded':
        return 'text-danger-600 bg-danger-100 dark:text-danger-400 dark:bg-danger-900'
      case 'warning':
        return 'text-warning-600 bg-warning-100 dark:text-warning-400 dark:bg-warning-900'
      default:
        return 'text-success-600 bg-success-100 dark:text-success-400 dark:bg-success-900'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'exceeded':
        return <AlertTriangle className="w-4 h-4" />
      case 'warning':
        return <TrendingUp className="w-4 h-4" />
      default:
        return <CheckCircle className="w-4 h-4" />
    }
  }

  const renderBudgetList = (budgetList: any[]) => (
    <div className="space-y-6">
      {budgetList.length > 0 ? (
        budgetList.map((budget, index) => (
          <motion.div
            key={budget.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900 rounded-lg flex items-center justify-center">
                  {budget.isShared ? (
                    <Users className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                  ) : (
                    <Target className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                  )}
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="font-medium text-gray-900 dark:text-white">{budget.categoryName}</h3>
                    {budget.isShared && budget.groupName && (
                      <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">
                        {budget.groupName}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {new Date(budget.month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </p>
                  {budget.isShared && budget.sharedMembers && budget.sharedMembers.length > 0 && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      {budget.sharedMembers.length} member{budget.sharedMembers.length > 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              </div>
              
              <div className="flex items-center space-x-4">
                <div className="text-right">
                  <p className="text-sm text-gray-600 dark:text-gray-400">Spent / Budget</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {formatCurrency(budget.spent)} / {formatCurrency(budget.limitAmount)}
                  </p>
                </div>
                
                <div className={`px-3 py-1 rounded-full text-xs font-medium flex items-center space-x-1 ${getStatusColor(budget.status)}`}>
                  {getStatusIcon(budget.status)}
                  <span>{Math.round(budget.percentage)}%</span>
                </div>
                
                {budget.isShared && user?.id && (
                  <button
                    onClick={() => handleMarkAsPaid(budget.id)}
                    disabled={markingPaid.get(budget.id) || paymentStatuses.get(budget.id)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      paymentStatuses.get(budget.id)
                        ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 cursor-not-allowed'
                        : 'bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-50 disabled:cursor-not-allowed'
                    }`}
                  >
                    {markingPaid.get(budget.id) ? 'Processing...' : paymentStatuses.get(budget.id) ? 'Paid ✓' : 'Mark as Paid'}
                  </button>
                )}
                {!budget.isShared && (
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleEdit(budget)}
                      className="p-1 text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(budget.id)}
                      className="p-1 text-danger-600 hover:text-danger-700 dark:text-danger-400 dark:hover:text-danger-300"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
            
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-300 ${
                  budget.status === 'exceeded' 
                    ? 'bg-danger-500' 
                    : budget.status === 'warning' 
                    ? 'bg-warning-500' 
                    : 'bg-success-500'
                }`}
                style={{ width: `${Math.min(budget.percentage, 100)}%` }}
              />
            </div>
          </motion.div>
        ))
      ) : (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <Target className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
          <p>No {activeTab === 'my' ? 'personal' : 'shared'} budgets set yet.</p>
        </div>
      )}
    </div>
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between budget-setup-section">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Budgets</h1>
          <p className="text-gray-600 dark:text-gray-300">Set and monitor your monthly budgets</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowSharedForm(true)}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors flex items-center space-x-2"
          >
            <Users className="w-4 h-4" />
            <span>Create Shared Budget</span>
          </button>
          <button
            id="add-budget-btn"
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add Budget</span>
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Budget</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(totalBudget)}
              </p>
            </div>
            <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900 rounded-lg flex items-center justify-center">
              <Target className="w-6 h-6 text-primary-600 dark:text-primary-400" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Spent</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(totalSpent)}
              </p>
            </div>
            <div className="w-12 h-12 bg-danger-100 dark:bg-danger-900 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-danger-600 dark:text-danger-400" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Remaining</p>
              <p className={`text-2xl font-bold ${totalRemaining >= 0 ? 'text-success-600' : 'text-danger-600'}`}>
                {formatCurrency(Math.abs(totalRemaining))}
              </p>
            </div>
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
              totalRemaining >= 0 ? 'bg-success-100 dark:bg-success-900' : 'bg-danger-100 dark:bg-danger-900'
            }`}>
              {totalRemaining >= 0 ? (
                <CheckCircle className="w-6 h-6 text-success-600 dark:text-success-400" />
              ) : (
                <AlertTriangle className="w-6 h-6 text-danger-600 dark:text-danger-400" />
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Tabs */}
      <div className="card">
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveTab('my')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'my'
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              My Budgets ({myBudgets.length})
            </button>
            <button
              onClick={() => setActiveTab('shared')}
              className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                activeTab === 'shared'
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Shared Budgets ({sharedBudgets.length})</span>
            </button>
          </nav>
        </div>

        <div className="mt-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
            {activeTab === 'my' ? 'Budget Progress' : 'Shared Budget Progress'}
          </h2>
          {activeTab === 'my' ? renderBudgetList(myBudgetsWithSpent) : renderBudgetList(sharedBudgetsWithSpent)}
        </div>
      </div>

      {/* Unlinked Expenses Prompt */}
      <AnimatePresence>
        {showUnlinkedExpensesPrompt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md"
            >
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Link Existing Expenses?
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                You have {unlinkedExpenses.length} existing expense{unlinkedExpenses.length > 1 ? 's' : ''} without a budget for this category and month. Do you want to link them to this new budget?
              </p>
              <div className="flex items-center space-x-3">
                <button
                  onClick={handleLinkExpenses}
                  className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors"
                >
                  Yes, Link Them
                </button>
                <button
                  onClick={() => {
                    setShowUnlinkedExpensesPrompt(false)
                    setUnlinkedExpenses([])
                    setNewBudgetId(null)
                  }}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-medium rounded-lg transition-colors"
                >
                  No, Skip
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add/Edit Budget Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowForm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {editingBudget ? 'Edit Budget' : 'Add Budget'}
                </h2>
                <button
                  onClick={() => {
                    setShowForm(false)
                    setEditingBudget(null)
                    if (error) dispatch(clearError())
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4 budget-form">
                {error && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Category
                  </label>
                  <select
                    value={formData.categoryId}
                    onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    required
                  >
                    <option value="">Select Category</option>
                    {sortCategoriesById(categories).map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Amount
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.limitAmount ?? ''}
                    onChange={(e) => setFormData({ ...formData, limitAmount: e.target.value ? parseFloat(e.target.value) : null })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="Enter budget amount"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Month
                  </label>
                  <input
                    type="month"
                    value={formData.month}
                    onChange={(e) => setFormData({ ...formData, month: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    required
                  />
                </div>

                <div className="flex items-center space-x-3 pt-4">
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors"
                  >
                    {editingBudget ? 'Update Budget' : 'Add Budget'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false)
                      setEditingBudget(null)
                      if (error) dispatch(clearError())
                    }}
                    className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-medium rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Shared Budget Modal */}
      <AnimatePresence>
        {showSharedForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowSharedForm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Create Shared Budget
                </h2>
                <button
                  onClick={() => {
                    setShowSharedForm(false)
                    setMemberInputs([])
                    if (error) dispatch(clearError())
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSharedSubmit} className="space-y-4">
                {error && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Group Name
                  </label>
                  <input
                    type="text"
                    value={sharedFormData.groupName}
                    onChange={(e) => setSharedFormData({ ...sharedFormData, groupName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="e.g., Roommates, Family"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Category
                  </label>
                  <select
                    value={sharedFormData.categoryId}
                    onChange={(e) => setSharedFormData({ ...sharedFormData, categoryId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    required
                  >
                    <option value="">Select Category</option>
                    {sortCategoriesById(categories).map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Amount
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={sharedFormData.limitAmount ?? ''}
                    onChange={(e) => setSharedFormData({ ...sharedFormData, limitAmount: e.target.value ? parseFloat(e.target.value) : null })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="Enter budget amount"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Month
                  </label>
                  <input
                    type="month"
                    value={sharedFormData.month}
                    onChange={(e) => setSharedFormData({ ...sharedFormData, month: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Add Members (Email or Phone)
                  </label>
                  {memberInputs.map((member, index) => (
                    <div key={index} className="mb-3">
                      <div className="flex items-center space-x-2">
                        <div className="flex-1 relative">
                          {member.emailOrPhone.includes('@') || !member.emailOrPhone ? (
                            <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                          ) : (
                            <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                          )}
                          <input
                            type="text"
                            value={member.emailOrPhone}
                            onChange={(e) => updateMemberInput(index, e.target.value)}
                            onFocus={() => {
                              if (suggestions.get(index) && suggestions.get(index)!.length > 0) {
                                const newShowSuggestions = new Map(showSuggestions)
                                newShowSuggestions.set(index, true)
                                setShowSuggestions(newShowSuggestions)
                              }
                            }}
                            onBlur={() => {
                              // Delay hiding suggestions to allow click on suggestion
                              setTimeout(() => {
                                const newShowSuggestions = new Map(showSuggestions)
                                newShowSuggestions.set(index, false)
                                setShowSuggestions(newShowSuggestions)
                              }, 200)
                            }}
                            className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
                              memberErrors.get(index) ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                            }`}
                            placeholder={member.emailOrPhone && member.emailOrPhone.includes('@') ? 'email@example.com' : 'Email or phone number'}
                          />
                          {memberErrors.get(index) && (
                            <p className="text-xs text-red-600 dark:text-red-400 mt-1">{memberErrors.get(index)}</p>
                          )}
                          {/* Suggestions dropdown */}
                          {showSuggestions.get(index) && suggestions.get(index) && suggestions.get(index)!.length > 0 && (
                            <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                              {suggestions.get(index)!.map((suggestion: any, sugIndex: number) => (
                                <div
                                  key={sugIndex}
                                  onClick={() => selectSuggestion(index, suggestion)}
                                  className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center space-x-3"
                                >
                                  <div className="flex-1">
                                    <p className="text-sm font-medium text-gray-900 dark:text-white">{suggestion.name}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                      {suggestion.email} {suggestion.phoneNumber && `• ${suggestion.phoneNumber}`}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {showSuggestions.get(index) && suggestions.get(index) && suggestions.get(index)!.length === 0 && memberInputs[index].emailOrPhone.trim().length >= 2 && (
                            <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg p-3">
                              <p className="text-sm text-gray-500 dark:text-gray-400">No users found</p>
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            removeMemberInput(index)
                            const newSuggestions = new Map(suggestions)
                            newSuggestions.delete(index)
                            setSuggestions(newSuggestions)
                            const newShowSuggestions = new Map(showSuggestions)
                            newShowSuggestions.delete(index)
                            setShowSuggestions(newShowSuggestions)
                            const newErrors = new Map(memberErrors)
                            newErrors.delete(index)
                            setMemberErrors(newErrors)
                          }}
                          className="p-2 text-red-600 hover:text-red-700 dark:text-red-400"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      {member.name && (
                        <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center space-x-1">
                          <CheckCircle className="w-3 h-3" />
                          <span>Selected: {member.name}</span>
                        </p>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addMemberInput}
                    className="flex items-center space-x-2 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Add Member</span>
                  </button>
                </div>

                <div className="flex items-center space-x-3 pt-4">
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
                  >
                    Create Shared Budget
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSharedForm(false)
                      setMemberInputs([])
                      if (error) dispatch(clearError())
                    }}
                    className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-medium rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default Budgets
