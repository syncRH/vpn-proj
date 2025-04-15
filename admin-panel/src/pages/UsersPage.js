import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Paper, CircularProgress, Snackbar, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, IconButton
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { 
  Add as AddIcon, 
  ContentCopy as CopyIcon, 
  Delete as DeleteIcon 
} from '@mui/icons-material';
import axios from 'axios';

const UsersPage = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    duration: 30,
    activationLimit: 1
  });

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/users');
      setUsers(response.data);
      setError(null);
    } catch (err) {
      console.error('Ошибка загрузки пользователей:', err);
      setError('Не удалось загрузить список пользователей');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleDialogOpen = () => {
    setFormData({
      email: '',
      duration: 30,
      activationLimit: 1
    });
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async () => {
    try {
      const response = await axios.post('/api/users/create-key', formData);
      setSnackbar({ 
        open: true, 
        message: `Ключ успешно создан: ${response.data.activationKey}`, 
        severity: 'success' 
      });
      
      fetchUsers();
      handleDialogClose();
    } catch (err) {
      console.error('Ошибка при создании ключа:', err);
      setSnackbar({
        open: true,
        message: 'Ошибка при создании ключа активации',
        severity: 'error'
      });
    }
  };

  const handleDeleteUser = async (id) => {
    if (window.confirm('Вы действительно хотите удалить этого пользователя?')) {
      try {
        await axios.delete(`/api/users/${id}`);
        setSnackbar({ open: true, message: 'Пользователь успешно удален', severity: 'success' });
        fetchUsers();
      } catch (err) {
        console.error('Ошибка при удалении пользователя:', err);
        setSnackbar({ open: true, message: 'Ошибка при удалении пользователя', severity: 'error' });
      }
    }
  };

  const handleCopyKey = (key) => {
    navigator.clipboard.writeText(key);
    setSnackbar({ open: true, message: 'Ключ скопирован в буфер обмена', severity: 'info' });
  };

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  const columns = [
    { field: 'id', headerName: 'ID', width: 90 },
    { field: 'email', headerName: 'Email', width: 200 },
    { field: 'activationKey', headerName: 'Ключ активации', width: 250,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Typography sx={{ mr: 1 }}>{params.value}</Typography>
          <IconButton size="small" onClick={() => handleCopyKey(params.value)}>
            <CopyIcon fontSize="small" />
          </IconButton>
        </Box>
      )
    },
    { field: 'status', headerName: 'Статус', width: 120,
      renderCell: (params) => (
        <Typography
          variant="body2"
          sx={{
            color: params.value === 'active' ? 'success.main' : 'error.main',
            fontWeight: 'bold'
          }}
        >
          {params.value === 'active' ? 'Активен' : 'Неактивен'}
        </Typography>
      )
    },
    { field: 'createdAt', headerName: 'Дата создания', width: 160,
      valueFormatter: (params) => {
        if (!params.value) return '';
        return new Date(params.value).toLocaleString();
      }
    },
    { field: 'expiresAt', headerName: 'Истекает', width: 160,
      valueFormatter: (params) => {
        if (!params.value) return '';
        return new Date(params.value).toLocaleString();
      }
    },
    {
      field: 'actions',
      headerName: 'Действия',
      width: 120,
      sortable: false,
      renderCell: (params) => (
        <Button
          variant="outlined"
          color="error"
          size="small"
          startIcon={<DeleteIcon />}
          onClick={() => handleDeleteUser(params.row.id)}
        >
          Удалить
        </Button>
      )
    }
  ];

  // Используем тестовые данные, если API не вернул результатов
  const testUsers = [
    { 
      id: 1, 
      email: 'user1@example.com', 
      activationKey: 'KEY1-ABCD-EFGH-1234', 
      status: 'active',
      createdAt: '2025-01-01T12:00:00Z',
      expiresAt: '2025-02-01T12:00:00Z'
    },
    { 
      id: 2, 
      email: 'user2@example.com', 
      activationKey: 'KEY2-IJKL-MNOP-5678', 
      status: 'active',
      createdAt: '2025-01-15T12:00:00Z',
      expiresAt: '2025-03-15T12:00:00Z'
    },
    { 
      id: 3, 
      email: 'user3@example.com', 
      activationKey: 'KEY3-QRST-UVWX-9012', 
      status: 'inactive',
      createdAt: '2025-01-20T12:00:00Z',
      expiresAt: '2025-02-20T12:00:00Z'
    }
  ];

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Пользователи VPN
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleDialogOpen}
        >
          Создать ключ
        </Button>
      </Box>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : (
        <Paper elevation={3} sx={{ height: 400, width: '100%' }}>
          <DataGrid
            rows={users.length ? users : testUsers}
            columns={columns}
            pageSize={5}
            rowsPerPageOptions={[5, 10, 20]}
            disableSelectionOnClick
          />
        </Paper>
      )}

      {/* Диалог создания ключа */}
      <Dialog open={dialogOpen} onClose={handleDialogClose} maxWidth="sm" fullWidth>
        <DialogTitle>
          Создать новый ключ активации
        </DialogTitle>
        <DialogContent>
          <TextField
            name="email"
            label="Email пользователя"
            value={formData.email}
            onChange={handleInputChange}
            fullWidth
            margin="normal"
          />
          <TextField
            name="duration"
            label="Срок действия (дни)"
            type="number"
            value={formData.duration}
            onChange={handleInputChange}
            fullWidth
            margin="normal"
            inputProps={{ min: 1, max: 365 }}
          />
          <TextField
            name="activationLimit"
            label="Лимит активаций"
            type="number"
            value={formData.activationLimit}
            onChange={handleInputChange}
            fullWidth
            margin="normal"
            inputProps={{ min: 1, max: 10 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDialogClose} color="inherit">
            Отмена
          </Button>
          <Button onClick={handleSubmit} variant="contained" color="primary">
            Создать
          </Button>
        </DialogActions>
      </Dialog>

      {/* Уведомление */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default UsersPage; 