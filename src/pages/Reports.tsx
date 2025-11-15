import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, TrendingUp, DollarSign, BarChart3, FileText, Table } from 'lucide-react'
import { PieChart as RechartsPieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'
import { useAppSelector, useAppDispatch } from '../redux/hooks'
import { fetchExpenses } from '../redux/slices/expenseSlice'
import { fetchBudgets } from '../redux/slices/budgetSlice'
import { fetchCategories } from '../redux/slices/categorySlice'
import { formatCurrency, formatDate } from '../utils/helpers'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

const Reports = () => {
  const dispatch = useAppDispatch()
  const { expenses } = useAppSelector((state) => state.expenses)
  const { budgets } = useAppSelector((state) => state.budgets)
  const { categories } = useAppSelector((state) => state.categories)
  const [selectedPeriod, setSelectedPeriod] = useState('month')
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [showExportDropdown, setShowExportDropdown] = useState(false)
  const exportDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    dispatch(fetchExpenses())
    dispatch(fetchBudgets())
    dispatch(fetchCategories())
  }, [dispatch])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target as Node)) {
        setShowExportDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const periods = [
    { value: 'week', label: 'This Week' },
    { value: 'month', label: 'This Month' },
    { value: 'quarter', label: 'This Quarter' },
    { value: 'year', label: 'This Year' },
  ]

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)

  // Filter expenses based on selected period
  const getFilteredExpenses = () => {
    const now = new Date()
    const startDate = new Date()
    
    switch (selectedPeriod) {
      case 'week':
        startDate.setDate(now.getDate() - 7)
        break
      case 'month':
        startDate.setMonth(selectedMonth)
        startDate.setFullYear(selectedYear)
        startDate.setDate(1)
        break
      case 'quarter':
        const quarter = Math.floor(selectedMonth / 3)
        startDate.setMonth(quarter * 3)
        startDate.setFullYear(selectedYear)
        startDate.setDate(1)
        break
      case 'year':
        startDate.setFullYear(selectedYear)
        startDate.setMonth(0)
        startDate.setDate(1)
        break
      default:
        return expenses
    }

    return expenses.filter(expense => {
      const expenseDate = new Date(expense.date)
      return expenseDate >= startDate && expenseDate <= now
    })
  }

  const filteredExpenses = getFilteredExpenses()

  // Calculate statistics
  const totalSpent = filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0)
  const avgExpense = filteredExpenses.length > 0 ? totalSpent / filteredExpenses.length : 0
  const maxExpense = Math.max(...filteredExpenses.map(e => e.amount), 0)

  // Default colors for pie chart
  const DEFAULT_COLORS = [
    '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
    '#06B6D4', '#84CC16', '#F97316', '#EC4899', '#6366F1',
    '#14B8A6', '#F43F5E', '#8B5CF6', '#06B6D4', '#84CC16'
  ]

  // Expenses by category
  const expensesByCategory = categories.map((category, index) => {
    const categoryExpenses = filteredExpenses.filter(expense => expense.category === category.name)
    const total = categoryExpenses.reduce((sum, expense) => sum + expense.amount, 0)
    return {
      name: category.name,
      value: total,
      color: category.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length],
      count: categoryExpenses.length
    }
  }).filter(item => item.value > 0)

  // Monthly trend data
  const monthlyData = months.map((month, index) => {
    const monthExpenses = expenses.filter(expense => {
      const expenseDate = new Date(expense.date)
      return expenseDate.getMonth() === index && expenseDate.getFullYear() === selectedYear
    })
    return {
      month: month.substring(0, 3),
      amount: monthExpenses.reduce((sum, expense) => sum + expense.amount, 0)
    }
  })

  // const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D']

  // Export functions
  const exportToPDF = () => {
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    let yPosition = 20

    // Title
    doc.setFontSize(18)
    doc.text('Expense Report', pageWidth / 2, yPosition, { align: 'center' })
    yPosition += 10

    // Period info
    doc.setFontSize(12)
    doc.text(`Period: ${periods.find(p => p.value === selectedPeriod)?.label || selectedPeriod}`, 14, yPosition)
    yPosition += 8
    if (selectedPeriod === 'month') {
      doc.text(`Month: ${months[selectedMonth]} ${selectedYear}`, 14, yPosition)
      yPosition += 8
    }
    yPosition += 5

    // Budget Summary
    if (budgets.length > 0) {
      doc.setFontSize(14)
      doc.text('Budget Summary', 14, yPosition)
      yPosition += 8

      const budgetData = budgets.map(budget => {
        const budgetExpenses = filteredExpenses.filter(exp => exp.category === budget.categoryName)
        const spent = budgetExpenses.reduce((sum, exp) => sum + exp.amount, 0)
        const remaining = budget.limitAmount - spent
        return [
          budget.categoryName || 'N/A',
          formatCurrency(budget.limitAmount),
          formatCurrency(spent),
          formatCurrency(remaining)
        ]
      })

      autoTable(doc, {
        head: [['Budget Name', 'Total Limit', 'Spent Amount', 'Remaining Amount']],
        body: budgetData,
        startY: yPosition,
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246] },
        styles: { fontSize: 9 }
      })
      yPosition = (doc as any).lastAutoTable.finalY + 10
    }

    // Expenses Table
    if (filteredExpenses.length > 0) {
      if (yPosition > pageHeight - 50) {
        doc.addPage()
        yPosition = 20
      }

      doc.setFontSize(14)
      doc.text('Expenses', 14, yPosition)
      yPosition += 8

      const expenseData = filteredExpenses.map(expense => [
        formatDate(expense.date),
        expense.name || 'N/A',
        expense.category || 'N/A',
        formatCurrency(expense.amount)
      ])

      autoTable(doc, {
        head: [['Date', 'Name', 'Category', 'Amount']],
        body: expenseData,
        startY: yPosition,
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246] },
        styles: { fontSize: 9 }
      })
    }

    // Save PDF
    const fileName = `expense-report-${new Date().toISOString().split('T')[0]}.pdf`
    doc.save(fileName)
    setShowExportDropdown(false)
  }

  const exportToExcel = () => {
    const workbook = XLSX.utils.book_new()

    // Budget Summary Sheet
    if (budgets.length > 0) {
      const budgetData = budgets.map(budget => {
        const budgetExpenses = filteredExpenses.filter(exp => exp.category === budget.categoryName)
        const spent = budgetExpenses.reduce((sum, exp) => sum + exp.amount, 0)
        const remaining = budget.limitAmount - spent
        return {
          'Budget Name': budget.categoryName || 'N/A',
          'Total Limit': budget.limitAmount,
          'Spent Amount': spent,
          'Remaining Amount': remaining
        }
      })

      const budgetSheet = XLSX.utils.json_to_sheet(budgetData)
      XLSX.utils.book_append_sheet(workbook, budgetSheet, 'Budgets')
    }

    // Expenses Sheet
    if (filteredExpenses.length > 0) {
      const expenseData = filteredExpenses.map(expense => ({
        Date: formatDate(expense.date),
        Name: expense.name || 'N/A',
        Category: expense.category || 'N/A',
        Amount: expense.amount
      }))

      const expenseSheet = XLSX.utils.json_to_sheet(expenseData)
      XLSX.utils.book_append_sheet(workbook, expenseSheet, 'Expenses')
    }

    // Save Excel file
    const fileName = `expense-report-${new Date().toISOString().split('T')[0]}.xlsx`
    XLSX.writeFile(workbook, fileName)
    setShowExportDropdown(false)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reports & Analytics</h1>
          <p className="text-gray-600 dark:text-gray-400">Comprehensive financial reports and insights</p>
        </div>
        <div className="relative" ref={exportDropdownRef}>
          <button 
            onClick={() => setShowExportDropdown(!showExportDropdown)}
            className="btn-primary flex items-center space-x-2 relative"
          >
            <Download className="w-4 h-4" />
            <span>Export Report</span>
          </button>
          
          <AnimatePresence>
            {showExportDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50"
              >
                <button
                  onClick={exportToPDF}
                  className="w-full px-4 py-3 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2 rounded-t-lg transition-colors"
                >
                  <FileText className="w-4 h-4 text-red-600" />
                  <span className="text-gray-900 dark:text-white">Export as PDF</span>
                </button>
                <button
                  onClick={exportToExcel}
                  className="w-full px-4 py-3 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2 rounded-b-lg transition-colors"
                >
                  <Table className="w-4 h-4 text-green-600" />
                  <span className="text-gray-900 dark:text-white">Export as Excel</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Time Period
            </label>
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="input-field"
            >
              {periods.map(period => (
                <option key={period.value} value={period.value}>
                  {period.label}
                </option>
              ))}
            </select>
          </div>
          
          {selectedPeriod === 'month' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Month
                </label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                  className="input-field"
                >
                  {months.map((month, index) => (
                    <option key={index} value={index}>
                      {month}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Year
                </label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                  className="input-field"
                >
                  {years.map(year => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="card p-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Spent</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(totalSpent)}
              </p>
            </div>
            <div className="p-3 bg-primary-100 dark:bg-primary-900 rounded-lg">
              <DollarSign className="w-6 h-6 text-primary-600 dark:text-primary-400" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="card p-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Average Expense</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(avgExpense)}
              </p>
            </div>
            <div className="p-3 bg-success-100 dark:bg-success-900 rounded-lg">
              <TrendingUp className="w-6 h-6 text-success-600 dark:text-success-400" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="card p-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Highest Expense</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(maxExpense)}
              </p>
            </div>
            <div className="p-3 bg-warning-100 dark:bg-warning-900 rounded-lg">
              <TrendingUp className="w-6 h-6 text-warning-600 dark:text-warning-400" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          className="card p-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Transactions</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {filteredExpenses.length}
              </p>
            </div>
            <div className="p-3 bg-info-100 dark:bg-info-900 rounded-lg">
              <BarChart3 className="w-6 h-6 text-info-600 dark:text-info-400" />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Expenses by Category */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="card p-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Expenses by Category
          </h3>
          {expensesByCategory.length > 0 ? (
            <div>
              <ResponsiveContainer width="100%" height={300}>
                <RechartsPieChart>
                  <Pie
                    data={expensesByCategory}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    innerRadius={40}
                    paddingAngle={2}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {expensesByCategory.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.color}
                        stroke="#ffffff"
                        strokeWidth={2}
                      />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value) => formatCurrency(value as number)}
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}
                  />
                </RechartsPieChart>
              </ResponsiveContainer>
              {/* Legend */}
              <div className="mt-4 grid grid-cols-2 gap-2">
                {expensesByCategory.map((item) => (
                  <div key={item.name} className="flex items-center space-x-2 text-sm">
                    <div 
                      className="w-3 h-3 rounded-full flex-shrink-0" 
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-gray-600 dark:text-gray-300 truncate">
                      {item.name}
                    </span>
                    <span className="text-gray-900 dark:text-white font-medium ml-auto">
                      {formatCurrency(item.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-500 dark:text-gray-400">
              No data available for the selected period
            </div>
          )}
        </motion.div>

        {/* Monthly Trend */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="card p-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Monthly Spending Trend
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(value) => formatCurrency(value as number)} />
              <Line 
                type="monotone" 
                dataKey="amount" 
                stroke="#3B82F6" 
                strokeWidth={2}
                dot={{ fill: '#3B82F6', strokeWidth: 2, r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      {/* Recent Transactions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card p-6"
      >
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Recent Transactions
        </h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              {filteredExpenses.slice(0, 10).map((expense) => (
                <tr key={expense.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {formatDate(expense.date)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {expense.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200">
                      {expense.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                    {formatCurrency(expense.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </motion.div>
  )
}

export default Reports
